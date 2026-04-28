import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared across all ingestion adapters and the manual submission endpoint.

/**
 * Returns true if an event with the same normalised title already exists on the
 * same local calendar date (expressed as a UTC window) from a different source.
 *
 * Used for simple cross-source duplicate suppression at ingest time.
 * Same-source deduplication is handled by the upsert conflict key.
 */
export async function findDuplicateEvent(
  supabase: SupabaseClient,
  opts: {
    titleNormalized: string;
    /** UTC ISO for local midnight on the event date. */
    dayStartUtc: string;
    /** UTC ISO for local midnight on the following date. */
    dayEndUtc: string;
    venueId: string | null;
    cityNormalized: string;
    /** Source to exclude from the search (the caller's own source key). */
    excludeSource: string;
  }
): Promise<boolean> {
  let query = supabase
    .from("events")
    .select("id")
    .eq("title_normalized", opts.titleNormalized)
    .gte("start_at", opts.dayStartUtc)
    .lt("start_at", opts.dayEndUtc)
    .neq("source", opts.excludeSource);

  if (opts.venueId) {
    query = query.eq("venue_id", opts.venueId);
  } else {
    query = query.eq("city_normalized", opts.cityNormalized);
  }

  const { data } = await query.limit(1).maybeSingle();
  return !!data;
}

// Common named HTML entities → their UTF-8 characters.
// Covers the most frequent entities found in Ticketmaster and SAT JSON-LD descriptions.
const HTML_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  nbsp: "\u00A0", shy: "\u00AD",
  // French / accented
  agrave: "à", Agrave: "À", aacute: "á", Aacute: "Á", acirc: "â", Acirc: "Â",
  atilde: "ã", Atilde: "Ã", auml: "ä", Auml: "Ä", aring: "å", Aring: "Å",
  aelig: "æ", AElig: "Æ",
  ccedil: "ç", Ccedil: "Ç",
  egrave: "è", Egrave: "È", eacute: "é", Eacute: "É", ecirc: "ê", Ecirc: "Ê", euml: "ë", Euml: "Ë",
  igrave: "ì", Igrave: "Ì", iacute: "í", Iacute: "Í", icirc: "î", Icirc: "Î", iuml: "ï", Iuml: "Ï",
  ograve: "ò", Ograve: "Ò", oacute: "ó", Oacute: "Ó", ocirc: "ô", Ocirc: "Ô",
  otilde: "õ", Otilde: "Õ", ouml: "ö", Ouml: "Ö",
  ugrave: "ù", Ugrave: "Ù", uacute: "ú", Uacute: "Ú", ucirc: "û", Ucirc: "Û", uuml: "ü", Uuml: "Ü",
  ntilde: "ñ", Ntilde: "Ñ",
  // Punctuation
  lsquo: "\u2018", rsquo: "\u2019", sbquo: "\u201A",
  ldquo: "\u201C", rdquo: "\u201D", bdquo: "\u201E",
  laquo: "\u00AB", raquo: "\u00BB",
  ndash: "\u2013", mdash: "\u2014",
  hellip: "\u2026", middot: "\u00B7", bull: "\u2022",
  trade: "\u2122", reg: "\u00AE", copy: "\u00A9",
};

/**
 * Decodes HTML entities in a string and strips HTML tags.
 * Safe to use on untrusted content — no DOM is involved.
 * Applied to externally-sourced description fields before storing to DB.
 */
export function decodeHtmlEntities(s: string | null): string | null {
  if (!s) return s;
  return s
    // Strip HTML tags
    .replace(/<[^>]*>/g, " ")
    // Decimal numeric: &#39; &#233;
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    // Hex numeric: &#x27; &#xE9;
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Named: &rsquo; &eacute;
    .replace(/&([a-zA-Z]+);/g, (match, name) => HTML_ENTITIES[name] ?? match)
    // Collapse multiple spaces introduced by tag stripping
    .replace(/[ \t]+/g, " ")
    .trim() || null;
}

export function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Ensures a venue-type organizer exists for the given venue, then links it to
 * the event via event_organizers (role = 'venue', sort_order = 0).
 *
 * Safe to call on every ingest pass:
 *   - Organizer lookup/creation uses the venues row as the canonical source of truth.
 *   - Both the organizer upsert and the event_organizers insert use ON CONFLICT DO NOTHING.
 *   - Errors are non-fatal — the function logs a warning and returns without throwing
 *     so a single failure never aborts the surrounding ingest run.
 */
export async function attachVenueOrganizer(
  supabase: SupabaseClient,
  venueId: string,
  eventId: string,
): Promise<void> {
  try {
    // 1. Look up the organizer by venue_id — the indexed path after first run.
    const { data: existing } = await supabase
      .from("organizers")
      .select("id")
      .eq("venue_id", venueId)
      .eq("type", "venue")
      .maybeSingle();

    let organizerId: string | null = existing?.id ?? null;

    if (!organizerId) {
      // 2. Organizer doesn't exist yet — fetch the canonical venue name to create it.
      const { data: venue } = await supabase
        .from("venues")
        .select("name, name_normalized, city_normalized")
        .eq("id", venueId)
        .single();

      if (!venue) {
        console.warn(`[organizer] venue ${venueId} not found, skipping`);
        return;
      }

      // Slug formula mirrors the SQL migration: replace non-alphanumeric runs with
      // hyphens, collapse consecutive hyphens, strip leading/trailing hyphens.
      // normalizeText() already lowercases and strips diacritics.
      const slug = normalizeText(venue.name)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^-+|-+$/g, "");

      const { data: newOrg } = await supabase
        .from("organizers")
        .upsert(
          {
            name: venue.name,
            name_normalized: venue.name_normalized,
            type: "venue",
            venue_id: venueId,
            city_normalized: venue.city_normalized,
            slug,
          },
          { onConflict: "name_normalized,type", ignoreDuplicates: true },
        )
        .select("id")
        .maybeSingle();

      organizerId = newOrg?.id ?? null;

      // ignoreDuplicates: true returns null on conflict — refetch by name in that case.
      if (!organizerId) {
        const { data: byName } = await supabase
          .from("organizers")
          .select("id")
          .eq("name_normalized", venue.name_normalized)
          .eq("type", "venue")
          .maybeSingle();
        organizerId = byName?.id ?? null;
      }
    }

    if (!organizerId) {
      console.warn(`[organizer] could not resolve organizer for venue ${venueId}, skipping`);
      return;
    }

    // 3. Link event → organizer, no-op if the row already exists.
    await supabase
      .from("event_organizers")
      .upsert(
        { event_id: eventId, organizer_id: organizerId, role: "venue", sort_order: 0 },
        { onConflict: "event_id,organizer_id", ignoreDuplicates: true },
      );
  } catch (err) {
    console.warn(`[organizer] attachVenueOrganizer failed (venueId=${venueId} eventId=${eventId}):`, err);
  }
}

export type VenueInput = {
  name: string;
  address_line1: string | null;
  city: string;
  region?: string;
  postal_code?: string | null;
  country?: string;
  lat?: number | null;
  lng?: number | null;
  timezone?: string;
};

/**
 * Finds or creates a venue row.
 *
 * Matching order:
 *   1. venue_aliases (alias_normalized, city_normalized) — catches name variants
 *      across sources (e.g. "l'Escogriffe Bar Spectacle" → canonical Escogriffe row).
 *      If matched and the incoming data has fields that the canonical row is
 *      missing (address, lat, lng, postal_code), those fields are backfilled.
 *   2. venues (name_normalized, city_normalized) — exact-name match, existing
 *      behaviour.  Uses an atomic ON CONFLICT DO NOTHING upsert so concurrent
 *      ingestion runs cannot race and create duplicate rows.
 *
 * address_line1 is intentionally excluded from the conflict key — slight address
 * differences across sources should not produce separate venue rows for the
 * same place.
 *
 * Returns { id, isNew } or null if name is empty.
 */
export async function upsertVenue(
  supabase: SupabaseClient,
  venue: VenueInput
): Promise<{ id: string; isNew: boolean } | null> {
  if (!venue.name) return null;

  const nameNorm = normalizeText(venue.name);
  const cityNorm = normalizeText(venue.city);

  // ── Step 1: alias lookup ───────────────────────────────────────────────────
  const { data: aliasRow, error: aliasError } = await supabase
    .from("venue_aliases")
    .select("venue_id")
    .eq("alias_normalized", nameNorm)
    .eq("city_normalized", cityNorm)
    .limit(1)
    .maybeSingle();

  if (aliasError) throw aliasError;

  if (aliasRow?.venue_id) {
    console.log(
      `[venue:alias-match] incomingName="${venue.name}" venueId="${aliasRow.venue_id}"`
    );

    // Backfill any fields the canonical venue row is currently missing.
    const patch: Record<string, unknown> = {};
    const hasAddress = venue.address_line1 != null;
    const hasLat = venue.lat != null;
    const hasLng = venue.lng != null;
    const hasPostal = venue.postal_code != null;

    if (hasAddress || hasLat || hasLng || hasPostal) {
      // Fetch only the fields we might need to backfill.
      const { data: canonical } = await supabase
        .from("venues")
        .select("address_line1, lat, lng, postal_code")
        .eq("id", aliasRow.venue_id)
        .single();

      if (canonical) {
        if (hasAddress && canonical.address_line1 == null) patch.address_line1 = venue.address_line1;
        if (hasLat && canonical.lat == null) patch.lat = venue.lat;
        if (hasLng && canonical.lng == null) patch.lng = venue.lng;
        if (hasPostal && canonical.postal_code == null) patch.postal_code = venue.postal_code;
      }
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("venues").update(patch).eq("id", aliasRow.venue_id);
    }

    return { id: aliasRow.venue_id, isNew: false };
  }

  // ── Step 2: exact name_normalized + city_normalized upsert (existing path) ─
  const { data: upserted, error } = await supabase
    .from("venues")
    .upsert(
      {
        name: venue.name,
        name_normalized: nameNorm,
        address_line1: venue.address_line1,
        city: venue.city,
        city_normalized: cityNorm,
        region: venue.region ?? "QC",
        postal_code: venue.postal_code ?? null,
        country: venue.country ?? "CA",
        lat: venue.lat ?? null,
        lng: venue.lng ?? null,
        timezone: venue.timezone ?? "America/Toronto",
      },
      { onConflict: "name_normalized,city_normalized", ignoreDuplicates: true }
    )
    .select("id")
    .maybeSingle();

  if (error) throw error;

  // ignoreDuplicates: true returns nothing when the row already existed — refetch.
  if (!upserted?.id) {
    const { data: existing, error: fetchError } = await supabase
      .from("venues")
      .select("id")
      .eq("name_normalized", nameNorm)
      .eq("city_normalized", cityNorm)
      .limit(1)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing?.id) throw new Error(`upsertVenue: cannot find venue "${venue.name}"`);
    return { id: existing.id, isNew: false };
  }

  return { id: upserted.id, isNew: true };
}

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
 * Finds or creates a venue row, keyed on (name_normalized, city_normalized).
 *
 * Uses an atomic ON CONFLICT DO NOTHING upsert so concurrent ingestion runs
 * cannot race and create duplicate rows.  address_line1 is intentionally
 * excluded from the conflict key — slight address differences across sources
 * should not produce separate venue rows for the same place.
 *
 * Returns { id, isNew } or null if name is empty.
 *
 * Requires the DB migration add_venues_name_normalized.sql to have been run
 * (adds the name_normalized column and the unique constraint).
 */
export async function upsertVenue(
  supabase: SupabaseClient,
  venue: VenueInput
): Promise<{ id: string; isNew: boolean } | null> {
  if (!venue.name) return null;

  const nameNorm = normalizeText(venue.name);
  const cityNorm = normalizeText(venue.city);

  // Atomic insert — the DB unique constraint on (name_normalized, city_normalized)
  // handles concurrent runs without a SELECT-then-INSERT race.
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

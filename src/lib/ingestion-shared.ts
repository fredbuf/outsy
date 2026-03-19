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

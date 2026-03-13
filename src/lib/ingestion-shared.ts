import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared across all ingestion adapters and the manual submission endpoint.

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
 * Looks up an existing venue by (name, address_line1, city_normalized).
 * Inserts a new row if none found.
 * Returns { id, isNew } or null if name is empty.
 */
export async function upsertVenue(
  supabase: SupabaseClient,
  venue: VenueInput
): Promise<{ id: string; isNew: boolean } | null> {
  if (!venue.name) return null;

  const cityNorm = normalizeText(venue.city);

  const { data: existing } = await supabase
    .from("venues")
    .select("id")
    .eq("name", venue.name)
    .eq("address_line1", venue.address_line1)
    .eq("city_normalized", cityNorm)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { id: existing.id, isNew: false };

  const { data: inserted, error } = await supabase
    .from("venues")
    .insert({
      name: venue.name,
      address_line1: venue.address_line1,
      city: venue.city,
      city_normalized: cityNorm,
      region: venue.region ?? "QC",
      postal_code: venue.postal_code ?? null,
      country: venue.country ?? "CA",
      lat: venue.lat ?? null,
      lng: venue.lng ?? null,
      timezone: venue.timezone ?? "America/Toronto",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: inserted.id, isNew: true };
}

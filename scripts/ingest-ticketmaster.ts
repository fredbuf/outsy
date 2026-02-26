/* eslint-disable no-console */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

console.log("ENV check:", {
  hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  hasTM: !!process.env.TICKETMASTER_API_KEY,
});
import { createClient } from "@supabase/supabase-js";

function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function extractBestImageUrl(tm: any): string | null {
  const imgs = tm?.images ?? [];
  const best = imgs.sort((a: any, b: any) => (b?.width ?? 0) - (a?.width ?? 0))[0];
  return best?.url ?? null;
}

function pickCategory(tm: any): "music" | "nightlife" | "art" {
  const segment = tm?.classifications?.[0]?.segment?.name?.toLowerCase?.() || "";
  if (segment.includes("music")) return "music";
  if (segment.includes("arts") || segment.includes("theatre") || segment.includes("art")) return "art";
  return "music";
}

async function fetchTicketmasterMontreal(page = 0) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("Missing TICKETMASTER_API_KEY in .env.local");

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("locale", "*");
  url.searchParams.set("radius", "35");
  url.searchParams.set("unit", "km");
  url.searchParams.set("latlong", "45.5019,-73.5674"); // Montreal
  url.searchParams.set("size", "200");
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("classificationName", "music,arts");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Ticketmaster fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseUrl || !serviceKey) throw new Error("Missing Supabase env vars");

  const supabase = createClient(supabaseUrl, serviceKey);

  let page = 0;
  let totalPages = 1;
  let ingested = 0;

  while (page < totalPages) {
    const json = await fetchTicketmasterMontreal(page);
    const events = json?._embedded?.events ?? [];
    totalPages = json?.page?.totalPages ?? 0;

    for (const tm of events) {
      // Venue upsert
      const v = tm?._embedded?.venues?.[0];
      let venueId: string | null = null;

      if (v?.name) {
        const city = v?.city?.name ?? "Montréal";
        const cityNorm = normalizeText(city);
        const addr = v?.address?.line1 ?? null;

        const { data: existingVenue } = await supabase
          .from("venues")
          .select("id")
          .eq("name", v.name)
          .eq("address_line1", addr)
          .eq("city_normalized", cityNorm)
          .limit(1)
          .maybeSingle();

        if (existingVenue?.id) {
          venueId = existingVenue.id;
        } else {
          const { data: insertedVenue, error: venueErr } = await supabase
            .from("venues")
            .insert({
              name: v.name,
              address_line1: addr,
              city,
              city_normalized: cityNorm,
              region: v?.state?.stateCode ?? "QC",
              postal_code: v?.postalCode ?? null,
              country: v?.country?.countryCode ?? "CA",
              lat: v?.location?.latitude ? Number(v.location.latitude) : null,
              lng: v?.location?.longitude ? Number(v.location.longitude) : null,
              timezone: "America/Toronto",
            })
            .select("id")
            .single();

          if (venueErr) throw venueErr;
          venueId = insertedVenue.id;
        }
      }

      // Event upsert
      const sourceEventId = String(tm?.id ?? "");
      const startAt = tm?.dates?.start?.dateTime;
      if (!sourceEventId || !startAt) continue;

      const price = tm?.priceRanges?.[0];
      const payload = {
        title: tm?.name ?? "Untitled",
        title_normalized: normalizeText(tm?.name ?? "Untitled"),
        description: tm?.info ?? tm?.pleaseNote ?? null,
        start_at: startAt,
        end_at: tm?.dates?.end?.dateTime ?? null,
        timezone: "America/Toronto",
        status:
          tm?.dates?.status?.code === "cancelled" ? "cancelled" :
          tm?.dates?.status?.code === "postponed" ? "postponed" :
          "scheduled",
        category_primary: pickCategory(tm),
        tags: [],
        min_price: price?.min ?? null,
        max_price: price?.max ?? null,
        currency: price?.currency ?? "CAD",
        age_restriction: null,
        image_url: extractBestImageUrl(tm),
        source: "ticketmaster",
        source_event_id: sourceEventId,
        source_url: tm?.url ?? null,
        venue_id: venueId,
        city_normalized: "montreal",
      };

      const { error } = await supabase
        .from("events")
        .upsert(payload, { onConflict: "source,source_event_id" });

      if (error) throw error;
      ingested += 1;
    }

    console.log(`Page ${page + 1}/${totalPages} — ingested: ${ingested}`);
    page += 1;
  }

  console.log(`✅ Done. Total ingested: ${ingested}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
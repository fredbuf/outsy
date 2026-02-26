import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

type Category = "music" | "nightlife" | "art";

function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function extractBestImageUrl(tm: any): string | null {
  const imgs = tm?.images ?? [];
  const best = imgs.sort((a: any, b: any) => (b?.width ?? 0) - (a?.width ?? 0))[0];
  return best?.url ?? null;
}

function getTicketmasterText(tm: any) {
  const title = (tm?.name ?? "").toString();
  const venueName = (tm?._embedded?.venues?.[0]?.name ?? "").toString();

  const segment = (tm?.classifications?.[0]?.segment?.name ?? "").toString();
  const genre = (tm?.classifications?.[0]?.genre?.name ?? "").toString();
  const subGenre = (tm?.classifications?.[0]?.subGenre?.name ?? "").toString();

  return { title, venueName, segment, genre, subGenre };
}

function toLower(s: string) {
  return (s || "").toLowerCase();
}

function hasAny(haystack: string, needles: string[]) {
  const h = toLower(haystack);
  return needles.some((n) => h.includes(n));
}

function getHourLocal(isoUtc: string) {
  // Ticketmaster dateTime is typically an ISO UTC string.
  // We compute the hour in America/Toronto (Montreal) for classification.
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "00";
  return Number(hourPart);
}

function nightlifeScore(tm: any): number {
  const { title, venueName, genre, subGenre } = getTicketmasterText(tm);

  const nightlifeTitleKeywords = [
    "dj",
    "afterparty",
    "after party",
    "after-party",
    "rave",
    "club night",
    "clubnight",
    "dance party",
    "danceparty",
    "boiler room",
    "boilerroom",
    "late night",
    "latenight",
    "all night",
    "all-night",
    "warehouse",
    "edm",
    "electronic",
    "techno",
    "house",
    "trance",
    "drum",
    "dnb",
    "dubstep",
  ];

  const nightlifeVenueKeywords = [
    "club",
    "nightclub",
    "lounge",
    "bar",
    "pub",
    "rooftop",
    "cabaret",
  ];

  const nightlifeGenreKeywords = [
    "dance",
    "electronic",
    "club",
    "house",
    "techno",
    "edm",
    "trance",
    "drum",
    "bass",
    "dnb",
  ];

  let score = 0;

  // Time-based scoring (strong signal)
  const startAt = tm?.dates?.start?.dateTime;
  if (startAt) {
    const hour = getHourLocal(startAt);
    if (hour >= 23) score += 4;
    else if (hour >= 21) score += 3;
    else if (hour >= 19) score += 1;
  }

  // Keyword scoring
  if (hasAny(title, nightlifeTitleKeywords)) score += 3;
  if (hasAny(venueName, nightlifeVenueKeywords)) score += 2;

  const g = `${genre} ${subGenre}`;
  if (hasAny(g, nightlifeGenreKeywords)) score += 2;

  return score;
}

function pickCategory(tm: any): Category {
  const { segment } = getTicketmasterText(tm);
  const segmentLower = toLower(segment);

  // If Ticketmaster says it's arts/theatre, keep it art no matter what
  if (
    segmentLower.includes("arts") ||
    segmentLower.includes("theatre") ||
    segmentLower.includes("art")
  ) {
    return "art";
  }

  // Nightlife inference
  const score = nightlifeScore(tm);
  if (score >= 5) return "nightlife";

  // Default
  return "music";
}

async function fetchTicketmasterMontreal(page = 0, size = 50) {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("Missing TICKETMASTER_API_KEY");

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("locale", "*");
  url.searchParams.set("radius", "35");
  url.searchParams.set("unit", "km");
  url.searchParams.set("latlong", "45.5019,-73.5674");
  url.searchParams.set("size", String(size));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("classificationName", "music,arts");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Ticketmaster fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Cron hits this with: /api/cron/ingest-ticketmaster?key=CRON_SECRET&maxPages=3
export async function GET(req: Request) {
  const url = new URL(req.url);

  // --- Auth ---
  const key = url.searchParams.get("key");
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // --- Controls ---
  const maxPages = Number(url.searchParams.get("maxPages") ?? "3");
  const maxPagesSafe = Number.isFinite(maxPages) && maxPages > 0 ? Math.floor(maxPages) : 3;

  const size = Number(url.searchParams.get("size") ?? "50");
  const sizeSafe = Number.isFinite(size) && size > 0 && size <= 200 ? Math.floor(size) : 50;

  const supabase = supabaseServer();

  let page = 0;
  let totalPages = 1;
  let ingested = 0;
  let venuesUpserted = 0;

  while (page < totalPages && page < maxPagesSafe) {
    const json = await fetchTicketmasterMontreal(page, sizeSafe);
    const events = json?._embedded?.events ?? [];
    totalPages = json?.page?.totalPages ?? 0;

    for (const tm of events) {
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
          venuesUpserted += 1;
        }
      }

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
          tm?.dates?.status?.code === "cancelled"
            ? "cancelled"
            : tm?.dates?.status?.code === "postponed"
              ? "postponed"
              : "scheduled",
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

    page += 1;
  }

  return NextResponse.json({
    ok: true,
    ingested,
    venuesUpserted,
    pagesProcessed: page,
    totalPagesReportedByTicketmaster: totalPages,
    maxPagesUsed: maxPagesSafe,
    sizeUsed: sizeSafe,
  });
}
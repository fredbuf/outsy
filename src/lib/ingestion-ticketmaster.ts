import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type Category = "music" | "nightlife" | "art";
type TicketmasterImage = { url?: string; width?: number };
type TicketmasterVenue = {
  name?: string;
  city?: { name?: string };
  address?: { line1?: string };
  state?: { stateCode?: string };
  postalCode?: string;
  country?: { countryCode?: string };
  location?: { latitude?: string; longitude?: string };
};
type TicketmasterEvent = {
  id?: string;
  name?: string;
  info?: string;
  pleaseNote?: string;
  url?: string;
  images?: TicketmasterImage[];
  dates?: {
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    status?: { code?: string };
  };
  priceRanges?: Array<{ min?: number; max?: number; currency?: string }>;
  classifications?: Array<{
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }>;
  _embedded?: { venues?: TicketmasterVenue[] };
};
type TicketmasterPageResponse = {
  _embedded?: { events?: TicketmasterEvent[] };
  page?: { totalPages?: number };
};

type IngestOptions = {
  maxPages: number;
  size: number;
};

type IngestResult = {
  ok: true;
  ingested: number;
  venuesUpserted: number;
  pagesProcessed: number;
  totalPagesReportedByTicketmaster: number;
  maxPagesUsed: number;
  sizeUsed: number;
};

function normalizeText(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function extractBestImageUrl(tm: TicketmasterEvent): string | null {
  const imgs = tm?.images ?? [];
  const best = imgs.sort((a, b) => (b?.width ?? 0) - (a?.width ?? 0))[0];
  return best?.url ?? null;
}

function getTicketmasterText(tm: TicketmasterEvent) {
  const title = (tm?.name ?? "").toString();
  const venueName = (tm?._embedded?.venues?.[0]?.name ?? "").toString();

  const segment = (tm?.classifications?.[0]?.segment?.name ?? "").toString();
  const genre = (tm?.classifications?.[0]?.genre?.name ?? "").toString();
  const subGenre = (tm?.classifications?.[0]?.subGenre?.name ?? "").toString();

  return { title, venueName, segment, genre, subGenre };
}

function hasAny(haystack: string, needles: string[]) {
  const h = normalizeText(haystack);
  return needles.some((needle) => h.includes(normalizeText(needle)));
}

function getHourLocal(isoUtc: string) {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "00";
  return Number(hourPart);
}

function nightlifeScore(tm: TicketmasterEvent): number {
  const { title, venueName, genre, subGenre } = getTicketmasterText(tm);

  const nightlifeTitleKeywords = [
    "dj",
    "afterparty",
    "after party",
    "after-party",
    "rave",
    "soirée",
    "soiree",
    "club night",
    "dance party",
    "boiler room",
    "late night",
    "all night",
    "warehouse",
    "set",
    "electro",
    "edm",
    "electronic",
    "techno",
    "house",
    "trance",
    "drum and bass",
    "dnb",
    "dubstep",
    "afrobeats",
    "reggaeton",
    "open format",
  ];

  const nightlifeVenueKeywords = [
    "club",
    "nightclub",
    "lounge",
    "bar",
    "pub",
    "rooftop",
    "cabaret",
    "terrasse",
    "stereo",
    "new city gas",
    "foufounes",
    "societe",
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
    "hip-hop",
    "rap",
    "afrobeats",
    "reggaeton",
    "latin",
  ];

  const negativeTitleKeywords = [
    "matinee",
    "family",
    "kids",
    "enfants",
    "symphony",
    "orchestra",
    "opera",
    "theatre",
    "theater",
    "museum",
    "expo",
    "exposition",
  ];

  let score = 0;

  const startAt = tm?.dates?.start?.dateTime;
  if (startAt) {
    const hour = getHourLocal(startAt);
    if (hour >= 23 || hour < 3) score += 5;
    else if (hour >= 21) score += 3;
    else if (hour >= 19) score += 1;
    else if (hour < 16) score -= 2;
  }

  if (hasAny(title, nightlifeTitleKeywords)) score += 3;
  if (hasAny(venueName, nightlifeVenueKeywords)) score += 2;

  const genreText = `${genre} ${subGenre}`;
  if (hasAny(genreText, nightlifeGenreKeywords)) score += 2;

  if (hasAny(title, negativeTitleKeywords)) score -= 3;

  return score;
}

function pickCategory(tm: TicketmasterEvent): Category {
  const { segment, genre, subGenre, title } = getTicketmasterText(tm);
  const segmentLower = normalizeText(segment);
  const g = normalizeText(`${genre} ${subGenre}`);
  const t = normalizeText(title);

  if (
    segmentLower.includes("arts") ||
    segmentLower.includes("theatre") ||
    segmentLower.includes("theater") ||
    segmentLower.includes("art") ||
    g.includes("classical") ||
    g.includes("opera") ||
    t.includes("exposition") ||
    t.includes("gallery")
  ) {
    return "art";
  }

  const score = nightlifeScore(tm);
  if (score >= 5) return "nightlife";

  return "music";
}

async function fetchTicketmasterMontreal(page = 0, size = 50): Promise<TicketmasterPageResponse> {
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
  if (!res.ok) {
    throw new Error(`Ticketmaster fetch failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as TicketmasterPageResponse;
}

export async function ingestTicketmasterMontreal(options: IngestOptions): Promise<IngestResult> {
  const maxPagesSafe =
    Number.isFinite(options.maxPages) && options.maxPages > 0 ? Math.floor(options.maxPages) : 3;
  const sizeSafe =
    Number.isFinite(options.size) && options.size > 0 && options.size <= 200
      ? Math.floor(options.size)
      : 50;

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
        is_approved: true,
      };

      const { error } = await supabase
        .from("events")
        .upsert(payload, { onConflict: "source,source_event_id" });

      if (error) throw error;
      ingested += 1;
    }

    page += 1;
  }

  return {
    ok: true,
    ingested,
    venuesUpserted,
    pagesProcessed: page,
    totalPagesReportedByTicketmaster: totalPages,
    maxPagesUsed: maxPagesSafe,
    sizeUsed: sizeSafe,
  };
}

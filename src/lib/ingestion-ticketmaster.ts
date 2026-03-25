import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue, decodeHtmlEntities } from "@/lib/ingestion-shared";

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
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
  sales?: {
    public?: { startDateTime?: string; endDateTime?: string };
    presales?: Array<{ startDateTime?: string; endDateTime?: string; name?: string }>;
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
  startPage?: number;
};

type IngestResult = {
  ok: true;
  ingested: number;
  skipped: number;
  venuesUpserted: number;
  descriptionsNulled: number;
  announcedCount: number;
  pagesProcessed: number;
  startPageUsed: number;
  endPageReached: number;
  totalPagesReportedByTicketmaster: number;
  maxPagesUsed: number;
  sizeUsed: number;
  runId: string | null;
};


// Ticketmaster's `info` / `pleaseNote` fields often contain legal boilerplate
// instead of a real event description.  Detect it and return null so we don't
// surface policy text to users.
//
// English and French patterns are both needed — many Québec events have
// French-language legal text that the English patterns miss.
const DESCRIPTION_JUNK_PATTERNS = [
  // English
  "privacy policy",
  "terms and conditions",
  "terms & conditions",
  "code of conduct",
  "by continuing to",
  "ticket terms",
  "terms of service",
  "by purchasing",
  "no refunds",
  "all sales final",
  "refund policy",
  "data protection",
  // French (diacritics stripped before comparison, so use normalised forms)
  "en poursuivant",           // "en poursuivant votre navigation…"
  "politique de confidentialit", // covers "politique de confidentialité"
  "conditions general",          // covers "conditions générales / généraux" after NFD strip
  "conditions d'utilisation",
  "protection des donnees",      // "protection des données" normalised
  "vos donnees personnelles",    // "vos données personnelles"
  "charte de confidentialit",    // privacy charter
  "mentions legales",            // "mentions légales" normalised
  "politique de cookies",
  "droits reserves",             // "droits réservés" normalised
];

function sanitizeTicketmasterDescription(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const decoded = decodeHtmlEntities(raw);
  if (!decoded) return null;
  // Normalise to NFD and strip diacritics before pattern matching so that
  // French patterns like "politique de confidentialit" match accented text
  // ("confidentialité") without needing accented variants in the list.
  const searchable = decoded.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const isJunk = DESCRIPTION_JUNK_PATTERNS.some((pat) => searchable.includes(pat));
  return isJunk ? null : decoded;
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
  const seg = normalizeText(segment);
  const g = normalizeText(`${genre} ${subGenre}`);
  const t = normalizeText(title);

  // Deterministic order: most specific segment first.
  if (seg.includes("sports")) return "sports";
  if (seg.includes("family") || hasAny(title, ["family", "kids", "children", "enfants"])) return "family";
  if (g.includes("comedy") || g.includes("stand up") || hasAny(title, ["comedy", "stand up", "stand-up"])) return "comedy";
  if (
    seg.includes("arts") || seg.includes("theatre") || seg.includes("theater") || seg.includes("art") ||
    g.includes("classical") || g.includes("opera") || g.includes("ballet") || g.includes("circus") ||
    t.includes("exposition") || t.includes("gallery") || t.includes("theatre") || t.includes("theater")
  ) return "arts_culture";
  if (nightlifeScore(tm) >= 5) return "nightlife";
  return "concerts";
}

async function fetchTicketmasterMontreal(page = 0, size = 50): Promise<TicketmasterPageResponse> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("Missing TICKETMASTER_API_KEY");

  // 9-month window: 6 months was too short — events like Two Door Cinema Club
  // at MTELUS on Oct 3 (9 days past the old Sep 24 cutoff) were silently missed.
  // setMonth handles year rollover correctly.
  const now = new Date();
  const nineMonthsLater = new Date(now);
  nineMonthsLater.setMonth(nineMonthsLater.getMonth() + 9);
  const startDateTime = now.toISOString().slice(0, 19) + "Z";
  const endDateTime = nineMonthsLater.toISOString().slice(0, 19) + "Z";

  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("locale", "*");
  url.searchParams.set("radius", "35");
  url.searchParams.set("unit", "km");
  url.searchParams.set("latlong", "45.5019,-73.5674");
  url.searchParams.set("size", String(size));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sort", "date,asc");
  url.searchParams.set("classificationName", "music,arts,sports");
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);

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
  const startPageSafe =
    options.startPage !== undefined &&
    Number.isFinite(options.startPage) &&
    options.startPage >= 0
      ? Math.floor(options.startPage)
      : 0;

  const supabase = supabaseServer();

  // Record ingestion run start.
  const { data: runRow } = await supabase
    .from("ingest_runs")
    .insert({ source: "ticketmaster", started_at: new Date().toISOString(), status: "running" })
    .select("id")
    .single();
  const runId: string | null = runRow?.id ?? null;

  async function finishRun(patch: Record<string, unknown>) {
    if (!runId) return;
    await supabase
      .from("ingest_runs")
      .update({ ...patch, finished_at: new Date().toISOString() })
      .eq("id", runId);
  }

  let page = startPageSafe;
  let totalPages = 1;
  let ingested = 0;
  let skipped = 0;
  let venuesUpserted = 0;
  let descriptionsNulled = 0;
  let announcedCount = 0;

  try {
    while (page < totalPages && page < startPageSafe + maxPagesSafe) {
      const json = await fetchTicketmasterMontreal(page, sizeSafe);
      const events = json?._embedded?.events ?? [];
      totalPages = json?.page?.totalPages ?? 0;

      for (const tm of events) {
        const v = tm?._embedded?.venues?.[0];
        let venueId: string | null = null;

        if (v?.name) {
          const result = await upsertVenue(supabase, {
            name: v.name,
            address_line1: v?.address?.line1 ?? null,
            city: v?.city?.name ?? "Montréal",
            region: v?.state?.stateCode ?? "QC",
            postal_code: v?.postalCode ?? null,
            country: v?.country?.countryCode ?? "CA",
            lat: v?.location?.latitude ? Number(v.location.latitude) : null,
            lng: v?.location?.longitude ? Number(v.location.longitude) : null,
            timezone: "America/Toronto",
          });
          if (result) {
            venueId = result.id;
            if (result.isNew) venuesUpserted += 1;
          }
        }

        const sourceEventId = String(tm?.id ?? "");
        const startAt = tm?.dates?.start?.dateTime;
        if (!sourceEventId || !startAt) {
          skipped += 1;
          continue;
        }

        const price = tm?.priceRanges?.[0];

        // Rescheduled events: TM creates a new event ID for the new date.
        // Keep the old record in the DB but mark it as postponed so it is
        // hidden from the feed.  On the same run the new event ID will be
        // ingested as "scheduled".
        //
        // "announced": public ticket sale hasn't started yet.
        // We detect this purely from sales.public.startDateTime > now,
        // regardless of dates.status.code.  TM's "offsale" code is unreliable
        // for this purpose — it also covers sold-out events (sale_start in
        // the past) and some onsale events are pre-sale with a future
        // sale_start.  The sale start timestamp is the authoritative signal.
        //
        // These events surface in the feed with a "Tickets soon" label.
        const statusCode = tm?.dates?.status?.code;
        const publicSaleStart = tm?.sales?.public?.startDateTime;
        const ingestNow = new Date();
        const ticketsNotYetOnSale =
          !!publicSaleStart && new Date(publicSaleStart) > ingestNow;
        const status =
          statusCode === "cancelled"
            ? "cancelled"
            : statusCode === "postponed" || statusCode === "rescheduled"
              ? "postponed"
              : ticketsNotYetOnSale
                ? "announced"
                : "scheduled";
        // Log every event where we evaluated sale timing so the full decision
        // chain is visible — not just the ones that resolved to "announced".
        if (publicSaleStart) {
          const saleStartMs = new Date(publicSaleStart).getTime();
          const future = saleStartMs > ingestNow.getTime();
          console.log(
            `[tm:sale] "${tm.name}" id=${sourceEventId}` +
            ` statusCode=${statusCode ?? "n/a"}` +
            ` publicSaleStart=${publicSaleStart}` +
            ` futureNow=${future}` +
            ` → ${status}`
          );
        }
        if (status === "announced") announcedCount += 1;

        const rawDesc = tm?.info ?? tm?.pleaseNote;
        const cleanDesc = sanitizeTicketmasterDescription(rawDesc);
        if (rawDesc && cleanDesc === null) descriptionsNulled += 1;

        const payload = {
          title: tm?.name ?? "Untitled",
          title_normalized: normalizeText(tm?.name ?? "Untitled"),
          // Prefer `info` (real description) over `pleaseNote` (usually legal text).
          // sanitizeTicketmasterDescription discards known boilerplate patterns.
          description: cleanDesc,
          start_at: startAt,
          end_at: tm?.dates?.end?.dateTime ?? null,
          timezone: "America/Toronto",
          status,
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
          // Only include venue_id when we found one — omitting it on conflict
          // preserves the existing venue_id rather than nullifying it.
          ...(venueId !== null ? { venue_id: venueId } : {}),
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

    await finishRun({ status: "success", ingested_count: ingested, skipped_count: skipped, venues_upserted: venuesUpserted, descriptions_nulled: descriptionsNulled, announced_count: announcedCount });

    return {
      ok: true,
      ingested,
      skipped,
      venuesUpserted,
      descriptionsNulled,
      announcedCount,
      pagesProcessed: page - startPageSafe,
      startPageUsed: startPageSafe,
      endPageReached: page - 1,
      totalPagesReportedByTicketmaster: totalPages,
      maxPagesUsed: maxPagesSafe,
      sizeUsed: sizeSafe,
      runId,
    };
  } catch (err) {
    await finishRun({
      status: "error",
      ingested_count: ingested,
      skipped_count: skipped,
      venues_upserted: venuesUpserted,
      error_message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue } from "@/lib/ingestion-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type NcgImage = { url?: string } | null | false;

type NcgAcf = {
  ncgev_id?: string;                 // Tixr event ID, e.g. "169571"
  ncgev_datestart?: string;          // "YYYY-MM-DD HH:MM:SS" (WP datetime)
  ncgev_dateend?: string;            // "YYYY-MM-DD HH:MM:SS"
  ncgev_timedoors?: string;          // "HH:MM:SS"
  ncgev_ticketprice?: string;        // not used for ingestion
  ncgev_status?: string;             // "public" | "private" | …
  ncgev_cta_type?: string;           // "tixr"
  // Image fields — full objects when acf_format=standard is used
  ncgev_img_websquare?: NcgImage;    // 1080×1080 — preferred
  ncgev_img_flyersq?: NcgImage;      // 1080×1080 — fallback
};

type NcgEvent = {
  id?: number;
  title?: { rendered?: string };
  acf?: NcgAcf;
};

export type SkipReasons = {
  nonPublic: number;
  missingSourceEventId: number;
  missingDate: number;
  invalidTime: number;
  missingStartAt: number;
  pastEvent: number;
};

export type IngestResult = {
  ok: true;
  ingested: number;
  skipped: number;
  skipReasons: SkipReasons;
  venuesUpserted: number;
  pagesProcessed: number;
  runId: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalises a raw time string to "HH:MM" (24-hour).
 * Supported formats:
 *   "22:00:00"   (WP datetime field — HH:MM:SS)
 *   "22:00"      (HH:MM)
 *   "10:00 PM"   (12-hour with space)
 *   "10PM"       (12-hour no colon)
 * Returns null for empty, "TBA", "TBD", or unrecognisable values.
 */
function normalizeTimeTo24h(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s || /^(tba|tbd)$/i.test(s)) return null;

  // 12-hour: "10:00 PM", "10:00PM", "10 PM", "10PM"
  const h12 = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(s);
  if (h12) {
    let hour = Number(h12[1]) % 12;
    if (h12[3].toUpperCase() === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${h12[2] ?? "00"}`;
  }

  // 24-hour with optional seconds: "22:00:00" or "22:00"
  const h24 = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (h24) return `${String(Number(h24[1])).padStart(2, "0")}:${h24[2]}`;

  return null;
}

/**
 * Converts a Montréal local date + HH:MM time string to a UTC ISO string.
 * Uses noon-UTC as an anchor so DST transitions are handled correctly.
 * Identical algorithm to the one used in ingestion-eventbrite.ts.
 */
function montrealLocalToUtc(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch) return null;
  const eventHours = Number(timeMatch[1]);
  const eventMinutes = Number(timeMatch[2]);

  const noonUtc = new Date(`${date}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);
  const noonLocalH = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const noonLocalM = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const noonLocalS = Number(parts.find((p) => p.type === "second")?.value ?? "0");

  const midnightUtcMs =
    noonUtc.getTime() - (noonLocalH * 3600 + noonLocalM * 60 + noonLocalS) * 1000;
  const eventUtcMs = midnightUtcMs + (eventHours * 3600 + eventMinutes * 60) * 1000;
  return new Date(eventUtcMs).toISOString();
}


/** Strips HTML entities left by WordPress in title.rendered. */
function decodeWpTitle(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

// ─── Image helper ─────────────────────────────────────────────────────────────

/** Extracts an image URL from ACF image fields returned by acf_format=standard. */
function extractImageUrl(acf: NcgAcf): string | null {
  const img = acf.ncgev_img_websquare || acf.ncgev_img_flyersq;
  if (img && typeof img === "object" && typeof img.url === "string" && img.url) {
    return img.url;
  }
  return null;
}

// ─── WordPress REST API fetch ─────────────────────────────────────────────────

const WP_API = "https://www.newcitygas.com/wp-json/wp/v2/ncgevent";

async function fetchPage(page: number): Promise<{ events: NcgEvent[]; totalPages: number }> {
  // acf_format=standard makes ACF return full image objects instead of bare IDs.
  const url = `${WP_API}?per_page=100&page=${page}&_fields=id,title,acf&acf_format=standard`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`New City Gas WP API responded ${res.status} on page ${page}`);
  }
  const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1", 10);
  const events = (await res.json()) as NcgEvent[];
  return { events, totalPages };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ingestNewCityGas(): Promise<IngestResult> {
  const supabase = supabaseServer();

  const { data: runRow } = await supabase
    .from("ingest_runs")
    .insert({
      source: "venue_newcitygas",
      started_at: new Date().toISOString(),
      status: "running",
    })
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

  let ingested = 0;
  let skipped = 0;
  const skipReasons: SkipReasons = {
    nonPublic: 0,
    missingSourceEventId: 0,
    missingDate: 0,
    invalidTime: 0,
    missingStartAt: 0,
    pastEvent: 0,
  };
  let firstSkipLogged = false;
  let venuesUpserted = 0;
  let page = 1;
  let totalPages = 1;

  function skip(ev: NcgEvent, acf: NcgAcf, reason: keyof SkipReasons, startAt?: string | null) {
    skipReasons[reason] += 1;
    skipped += 1;
    if (!firstSkipLogged) {
      firstSkipLogged = true;
      console.log(
        `[newcitygas] first skip — title=${JSON.stringify(ev.title?.rendered ?? "")} ` +
        `status=${acf.ncgev_status ?? "?"} id=${acf.ncgev_id ?? "?"} ` +
        `datestart=${acf.ncgev_datestart ?? "?"} timedoors=${acf.ncgev_timedoors ?? "?"} ` +
        `startAt=${startAt ?? "n/a"} reason=${reason}`
      );
    }
  }

  try {
    // New City Gas is a single venue — upsert once and reuse the ID.
    const venueResult = await upsertVenue(supabase, {
      name: "New City Gas",
      address_line1: "950 Ottawa St",
      city: "Montréal",
      region: "QC",
      country: "CA",
      timezone: "America/Toronto",
    });
    const venueId = venueResult?.id ?? null;
    if (venueResult?.isNew) venuesUpserted += 1;

    while (page <= totalPages) {
      const fetched = await fetchPage(page);
      totalPages = fetched.totalPages;

      for (const ev of fetched.events) {
        const acf = ev.acf ?? {};

        // Only ingest public events that have a Tixr ID.
        if (acf.ncgev_status !== "public") { skip(ev, acf, "nonPublic"); continue; }
        const tixrId = acf.ncgev_id?.trim();
        if (!tixrId) { skip(ev, acf, "missingSourceEventId"); continue; }

        // Resolve start_at: date (YYYY-MM-DD) + doors time → UTC.
        // ncgev_datestart may be "2026-05-16 22:00:00" — take only the date part.
        const dateStr = acf.ncgev_datestart?.trim().slice(0, 10);
        const timeStr = normalizeTimeTo24h(acf.ncgev_timedoors);
        if (!dateStr) { skip(ev, acf, "missingDate"); continue; }
        if (!timeStr) { skip(ev, acf, "invalidTime"); continue; }
        const startAt = montrealLocalToUtc(dateStr, timeStr);
        if (!startAt) { skip(ev, acf, "missingStartAt"); continue; }

        // Skip events that have already passed.
        if (new Date(startAt) < new Date()) { skip(ev, acf, "pastEvent", startAt); continue; }

        const title = ev.title?.rendered
          ? decodeWpTitle(ev.title.rendered)
          : "Untitled";

        const payload = {
          title,
          title_normalized: normalizeText(title),
          description: null,
          start_at: startAt,
          end_at: null,
          timezone: "America/Toronto",
          status: "scheduled" as const,
          category_primary: "nightlife" as const,
          tags: [] as string[],
          min_price: null,
          max_price: null,
          currency: "CAD",
          age_restriction: null,
          image_url: extractImageUrl(acf),
          source: "venue_newcitygas",
          source_event_id: tixrId,
          source_url: `https://tixr.com/e/${tixrId}`,
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

    console.log(
      `[newcitygas] done — ingested=${ingested} skipped=${skipped} pages=${page - 1} ` +
      `skipReasons=${JSON.stringify(skipReasons)}`
    );

    await finishRun({
      status: "success",
      ingested_count: ingested,
      skipped_count: skipped,
      venues_upserted: venuesUpserted,
    });

    return { ok: true, ingested, skipped, skipReasons, venuesUpserted, pagesProcessed: page - 1, runId };
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

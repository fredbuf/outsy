import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue, findDuplicateEvent, decodeHtmlEntities } from "@/lib/ingestion-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type SatOffer = {
  "@type"?: string;
  url?: string;
  price?: number | string | null;
  priceCurrency?: string;
};

type SatJsonLd = {
  "@type"?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
  image?: string | string[];
  url?: string;
  offers?: SatOffer | SatOffer[];
  location?: { name?: string };
  audience?: { audienceType?: string };
};

type Category = "music" | "nightlife" | "art";

export type SkipReasons = {
  pastEvent: number;
  invalidJsonLd: number;
  missingStartAt: number;
  missingSourceEventId: number;
  upsertError: number;
  multiDay: number;
  noScheduleTime: number;
  fallbackMidnight: number;
  duplicate: number;
};

export type IngestResult = {
  ok: true;
  ingested: number;
  skipped: number;
  skipReasons: SkipReasons;
  urlsFound: number;
  urlsProcessed: number;
  venuesUpserted: number;
  runId: string | null;
};

export type IngestOptions = {
  maxEvents?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const SAT_BASE = "https://sat.qc.ca";
// event-sitemap4.xml is the most recently updated event sitemap (as of research).
const SITEMAP_URL = `${SAT_BASE}/event-sitemap4.xml`;
// Browser UA required — SAT's CDN returns a 302 redirect for non-browser agents.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Converts a Montréal local date + HH:MM time string to a UTC ISO string.
 * Uses noon-UTC as an anchor so DST transitions are handled correctly.
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

/**
 * Returns true for multi-day exhibitions and festivals (span > 1 calendar day).
 * A span of exactly 1 is allowed because SAT nightclub events run past midnight
 * and therefore end on the following calendar day.
 */
function isMultiDaySpan(startRaw: string, endRaw: string | undefined): boolean {
  if (!endRaw) return false;
  const startDay = startRaw.slice(0, 10);
  const endDay = endRaw.slice(0, 10);
  if (startDay === endDay) return false;
  const diffMs = new Date(`${endDay}T00:00:00Z`).getTime() -
                 new Date(`${startDay}T00:00:00Z`).getTime();
  return diffMs > 86_400_000; // more than 1 calendar day
}

/** Extracts the slug from a /fr/evenements/<slug> URL. */
function slugFromUrl(pageUrl: string): string {
  return pageUrl.split("/fr/evenements/")[1]?.split("/")[0]?.trim() ?? "";
}

/** Returns the first offer from a JSON-LD offers field (object or array). */
function firstOffer(offers: SatOffer | SatOffer[] | undefined): SatOffer | null {
  if (!offers) return null;
  return Array.isArray(offers) ? (offers[0] ?? null) : offers;
}

/**
 * Derives a category from the event title.
 * Defaults to "art" unless clear nightlife signals are present.
 */
function pickCategory(title: string): Category {
  const n = normalizeText(title);
  if (/\b(all night|club sat|dj|techno|house|electronic|rave|dance party)\b/.test(n)) {
    return "nightlife";
  }
  return "art";
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

/**
 * Fetches the SAT event sitemap and returns /fr/evenements/ URLs sorted by
 * lastmod descending so the most recently updated (upcoming) events come first.
 */
async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`SAT sitemap fetch failed: ${res.status}`);
  const xml = await res.text();

  const entries: { url: string; lastmod: string }[] = [];
  const blockRe = /<url>([\s\S]*?)<\/url>/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(xml)) !== null) {
    const inner = block[1];
    const locMatch = /<loc>(https:\/\/sat\.qc\.ca\/fr\/evenements\/[^<]+)<\/loc>/.exec(inner);
    if (!locMatch) continue;
    const lastmodMatch = /<lastmod>([^<]+)<\/lastmod>/.exec(inner);
    entries.push({ url: locMatch[1].trim(), lastmod: lastmodMatch?.[1]?.trim() ?? "" });
  }

  // Most recently updated pages correspond to upcoming events.
  entries.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
  return entries.map((e) => e.url);
}

// Regex used both in extractHoraireTime and in fetchEventPage.
const HORAIRE_BLOCK_RE =
  /Horaire<\/div><\/div>\s*<div[^>]+block--sidebar-text__content[^>]*>([\s\S]*?)<\/div>/;

/**
 * Extracts the event start time from the Horaire block content string.
 *
 * SAT JSON-LD startDate is always T00:00:00Z (a date-only placeholder).
 * The real local start time appears in the sidebar in one of three formats:
 *
 *   1. Direct: "<br>22h-3h", "<br>19h30 à 23h"  — most common, always event time
 *   2. Event label: "Spectacle: 22h", "Concert à 19h30", "Performance: 21h"
 *   3. Doors fallback: "Portes: 22h", "Heure: 18h"  — used only when no better signal
 *
 * Returns a "HH:MM" string (e.g. "22:00", "19:30") or null if not found.
 */
function extractHoraireTime(content: string): string | null {
  function parseHhm(raw: string): string | null {
    const parts = /^(\d{1,2})h(\d{0,2})$/.exec(raw.trim());
    if (!parts) return null;
    const hh = parts[1].padStart(2, "0");
    const mm = (parts[2] || "00").padEnd(2, "0");
    return `${hh}:${mm}`;
  }

  // 1. <br> immediately followed by a time: "22h-3h", "19h30-22h30", "22h à 5h".
  const directMatch = /<br[^>]*>\s*(\d{1,2}h\d{0,2})/.exec(content);
  if (directMatch) return parseHhm(directMatch[1]);

  // 2. Labeled event-time: "Spectacle: 22h", "Concert à 19h30", "Performance: 21h".
  //    Preferred over doors time when the direct format is absent.
  const eventLabel =
    /(?:Spectacle|Concert|Performance|Show)[^0-9]{1,20}(\d{1,2}h\d{0,2})/i.exec(content);
  if (eventLabel) return parseHhm(eventLabel[1]);

  // 3. Doors/opening time as last resort: "Portes: 22h", "Heure: 18h".
  const doorsLabel =
    /(?:Portes|Doors|Heure)[^0-9]{0,20}(\d{1,2}h\d{0,2})/i.exec(content);
  if (doorsLabel) return parseHhm(doorsLabel[1]);

  return null;
}

/**
 * Fetches an event page and extracts the schema.org/Event JSON-LD block,
 * the Horaire sidebar content, and the resolved schedule time.
 * Returns null if the page is unreachable or contains no Event JSON-LD block.
 */
async function fetchEventPage(pageUrl: string): Promise<{
  ld: SatJsonLd;
  scheduleTime: string | null;
  horaireContent: string | null;
} | null> {
  const res = await fetch(pageUrl, {
    cache: "no-store",
    headers: { "User-Agent": BROWSER_UA },
  });
  if (!res.ok) return null;

  const html = await res.text();

  // Extract JSON-LD Event block.
  const scriptRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let ld: SatJsonLd | null = null;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const parsed: unknown = JSON.parse(m[1].trim());
      const items: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (
          item &&
          typeof item === "object" &&
          (item as Record<string, unknown>)["@type"] === "Event"
        ) {
          ld = item as SatJsonLd;
          break;
        }
      }
    } catch {
      // skip malformed JSON-LD blocks
    }
    if (ld) break;
  }
  if (!ld) return null;

  // Extract Horaire block once; pass content to extractor.
  const horaireMatch = HORAIRE_BLOCK_RE.exec(html);
  const horaireContent = horaireMatch?.[1] ?? null;
  return {
    ld,
    scheduleTime: horaireContent !== null ? extractHoraireTime(horaireContent) : null,
    horaireContent,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ingestSatMontreal(options: IngestOptions = {}): Promise<IngestResult> {
  // Cap at 200 to prevent runaway requests; default 60 covers most of sitemap4.
  const maxEvents = Math.min(Math.max(Number(options.maxEvents ?? 60), 1), 200);

  const supabase = supabaseServer();

  const { data: runRow } = await supabase
    .from("ingest_runs")
    .insert({
      source: "venue_sat",
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
  let parsedRealTime = 0;
  let firstDebugLogged = false;
  let firstLabeledTimeLogged = false;
  let noScheduleTimeDebugCount = 0;
  const skipReasons: SkipReasons = {
    pastEvent: 0,
    invalidJsonLd: 0,
    missingStartAt: 0,
    missingSourceEventId: 0,
    upsertError: 0,
    multiDay: 0,
    noScheduleTime: 0,
    fallbackMidnight: 0,
    duplicate: 0,
  };
  let firstSkipLogged = false;
  let venuesUpserted = 0;

  function skip(
    pageUrl: string,
    ld: SatJsonLd | null,
    reason: keyof SkipReasons
  ) {
    skipReasons[reason] += 1;
    skipped += 1;
    if (!firstSkipLogged) {
      firstSkipLogged = true;
      console.log(
        `[sat] first skip — url=${pageUrl} ` +
        `title=${JSON.stringify(ld?.name ?? "")} ` +
        `startDate=${ld?.startDate ?? "?"} ` +
        `slug=${slugFromUrl(pageUrl)} ` +
        `reason=${reason}`
      );
    }
  }

  try {
    const urls = await fetchSitemapUrls();
    const urlsFound = urls.length;
    const toProcess = urls.slice(0, maxEvents);

    // SAT events all take place at Espace SAT — upsert the venue once.
    const venueResult = await upsertVenue(supabase, {
      name: "Espace SAT",
      address_line1: "1195 Boul. Saint-Laurent",
      city: "Montréal",
      region: "QC",
      country: "CA",
      timezone: "America/Toronto",
    });
    const venueId = venueResult?.id ?? null;
    if (venueResult?.isNew) venuesUpserted += 1;

    for (const pageUrl of toProcess) {
      // Polite crawl delay between page fetches.
      await sleep(150);

      const slug = slugFromUrl(pageUrl);
      if (!slug) { skip(pageUrl, null, "missingSourceEventId"); continue; }

      const page = await fetchEventPage(pageUrl);
      if (!page) { skip(pageUrl, null, "invalidJsonLd"); continue; }
      const { ld, scheduleTime, horaireContent } = page;

      const rawStartDate = ld.startDate;
      if (!rawStartDate) { skip(pageUrl, ld, "missingStartAt"); continue; }

      // Skip multi-day exhibitions and festivals (span > 1 calendar day).
      // One-night club events ending after midnight have a span of exactly 1 day
      // and are kept.
      if (isMultiDaySpan(rawStartDate, ld.endDate)) { skip(pageUrl, ld, "multiDay"); continue; }

      const dateOnly = rawStartDate.slice(0, 10); // "YYYY-MM-DD"

      // Require a concrete Horaire time. Events with no parseable time (e.g.
      // "Mardi au samedi") don't have a reliable single start time for display.
      if (scheduleTime === null) {
        if (noScheduleTimeDebugCount < 2) {
          noScheduleTimeDebugCount += 1;
          console.log(
            `[sat] debug noScheduleTime #${noScheduleTimeDebugCount} — ` +
            `title=${JSON.stringify(ld.name ?? "")} ` +
            `horaire=${JSON.stringify((horaireContent ?? "").slice(0, 120))} ` +
            `→ skipped`
          );
        }
        skip(pageUrl, ld, "noScheduleTime");
        continue;
      }

      // "00:00" is treated as an unconfident fallback for launch — it is
      // indistinguishable from a parser miss since genuine SAT events never start
      // at local midnight. Skip to avoid polluting the feed with wrong times.
      if (scheduleTime === "00:00") {
        skip(pageUrl, ld, "fallbackMidnight");
        continue;
      }

      // At this point a real, non-midnight event time was confidently extracted.
      parsedRealTime += 1;

      // Debug: log first event resolved via labeled format ("Spectacle: 22h", etc.)
      // to confirm the extended parser is working.
      if (!firstLabeledTimeLogged && horaireContent !== null) {
        const isDirect = /<br[^>]*>\s*\d{1,2}h/.test(horaireContent);
        if (!isDirect) {
          firstLabeledTimeLogged = true;
          console.log(
            `[sat] debug labeled-time — title=${JSON.stringify(ld.name ?? "")} ` +
            `horaire=${JSON.stringify(horaireContent.slice(0, 120))} ` +
            `→ scheduleTime=${scheduleTime}`
          );
        }
      }

      const startAt = montrealLocalToUtc(dateOnly, scheduleTime);
      if (!startAt) { skip(pageUrl, ld, "missingStartAt"); continue; }

      if (!firstDebugLogged) {
        firstDebugLogged = true;
        const localDt = new Date(startAt).toLocaleString("en-CA", {
          timeZone: "America/Toronto",
          dateStyle: "medium",
          timeStyle: "short",
        });
        console.log(
          `[sat] debug first event — title=${JSON.stringify(ld.name ?? "")} ` +
          `rawStartDate=${rawStartDate} scheduleTime=${scheduleTime} ` +
          `start_at=${startAt} localMTL=${localDt}`
        );
      }

      // Skip events that have already started/passed.
      if (new Date(startAt) < new Date()) { skip(pageUrl, ld, "pastEvent"); continue; }

      const title = ld.name?.trim() ?? "Untitled";

      // endDate is set only when it differs from startDate (multi-day events).
      const rawEndDate = ld.endDate;
      const endDateOnly = rawEndDate && rawEndDate !== rawStartDate
        ? rawEndDate.slice(0, 10)
        : null;
      const endAt = endDateOnly ? montrealLocalToUtc(endDateOnly, "00:00") : null;

      const imageArr = Array.isArray(ld.image)
        ? ld.image
        : ld.image
          ? [ld.image]
          : [];
      const imageUrl = typeof imageArr[0] === "string" ? imageArr[0] : null;

      const offer = firstOffer(ld.offers);
      // Prefer ticket URL; fall back to the canonical SAT event page.
      const sourceUrl =
        typeof offer?.url === "string" && offer.url.startsWith("http")
          ? offer.url
          : `${SAT_BASE}${ld.url ?? `/fr/evenements/${slug}`}`;

      const payload = {
        title,
        title_normalized: normalizeText(title),
        description: typeof ld.description === "string" ? decodeHtmlEntities(ld.description) : null,
        start_at: startAt,
        end_at: endAt,
        timezone: "America/Toronto",
        status: "scheduled" as const,
        category_primary: pickCategory(title),
        tags: [] as string[],
        min_price: null,
        max_price: null,
        currency: "CAD",
        age_restriction: null,
        image_url: imageUrl,
        source: "venue_sat",
        source_event_id: slug,
        source_url: sourceUrl,
        venue_id: venueId,
        city_normalized: "montreal",
        is_approved: true,
      };

      // Suppress cross-source duplicates: skip if another source already has
      // an event with the same title on the same Montréal calendar date.
      const dayStartUtc = montrealLocalToUtc(dateOnly, "00:00")!;
      const dayEndUtc = new Date(
        new Date(dayStartUtc).getTime() + 86_400_000
      ).toISOString();
      const isDuplicate = await findDuplicateEvent(supabase, {
        titleNormalized: payload.title_normalized,
        dayStartUtc,
        dayEndUtc,
        venueId,
        cityNormalized: "montreal",
        excludeSource: "venue_sat",
      });
      if (isDuplicate) { skip(pageUrl, ld, "duplicate"); continue; }

      const { error } = await supabase
        .from("events")
        .upsert(payload, { onConflict: "source,source_event_id" });

      if (error) {
        console.error(`[sat] upsert error for slug=${slug}:`, error.message);
        skip(pageUrl, ld, "upsertError");
        continue;
      }

      ingested += 1;
    }

    console.log(
      `[sat] done — ingested=${ingested} parsedRealTime=${parsedRealTime} ` +
      `skippedFallbackMidnight=${skipReasons.fallbackMidnight} ` +
      `skipped=${skipped} urlsFound=${urlsFound} ` +
      `processed=${toProcess.length} skipReasons=${JSON.stringify(skipReasons)}`
    );

    await finishRun({
      status: "success",
      ingested_count: ingested,
      skipped_count: skipped,
      venues_upserted: venuesUpserted,
    });

    return {
      ok: true,
      ingested,
      skipped,
      skipReasons,
      urlsFound,
      urlsProcessed: toProcess.length,
      venuesUpserted,
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

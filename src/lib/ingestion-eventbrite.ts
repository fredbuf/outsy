import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue } from "@/lib/ingestion-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type IngestOptions = {
  maxPages: number;
  /** If provided, only these category slugs are scraped. Defaults to all. */
  categoryFilter?: string[];
};

export type CategoryStats = {
  slug: string;
  category: string;
  pages: number;
  cards: number;
  ingested: number;
  skipped: number;
  skipReasons: {
    missingSourceEventId: number;
    missingTitle: number;
    missingStartAt: number;
    duplicate: number;
  };
};

export type IngestResult = {
  ok: true;
  ingested: number;
  skipped: number;
  venuesUpserted: number;
  pagesProcessed: number;
  runId: string | null;
  categories: CategoryStats[];
};

// Internal shape for one parsed event card.
type EventCard = {
  sourceEventId: string; // numeric ID extracted from event URL
  sourceUrl: string;
  title: string | null;
  imageUrl: string | null;
  startAt: string | null; // ISO 8601
  venueName: string | null;
  isFree: boolean;
};

// ─── URL / ID pattern ─────────────────────────────────────────────────────────

// Eventbrite event URLs follow a stable pattern:
//   https://www.eventbrite.ca/e/some-title-tickets-1234567890
// The trailing numeric ID is Eventbrite's internal event ID and never changes.
const EB_EVENT_URL_RE =
  /href="(https?:\/\/www\.eventbrite\.[a-z]+\/e\/[^"?#]+)"/g;
const EB_ID_RE = /\/e\/[^/?#]+-(\d{7,})(?:[?#].*)?$/;

function extractIdFromUrl(url: string): string | null {
  return EB_ID_RE.exec(url)?.[1] ?? null;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

type Category = "music" | "nightlife" | "art";

const CATEGORIES: { slug: string; category: Category }[] = [
  { slug: "music--events",          category: "music"     },
  { slug: "nightlife--events",      category: "nightlife" },
  { slug: "performing-arts--events", category: "art"      },
];

function listingUrl(slug: string, page: number): string {
  return `https://www.eventbrite.ca/d/canada--montreal/${slug}/?page=${page}`;
}

async function fetchListingPage(slug: string, page: number): Promise<string> {
  const url = listingUrl(slug, page);
  const res = await fetch(url, {
    cache: "no-store",
    headers: {
      // Realistic browser headers — Eventbrite serves different HTML to known bots.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-CA,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`Eventbrite listing fetch failed: ${res.status} ${url}`);
  }
  return res.text();
}

// ─── Strategy A: href extraction ──────────────────────────────────────────────
// Most reliable signal. Event URLs survive any HTML redesign.
// Gives us: sourceEventId, sourceUrl. No other data.

function extractEventUrls(html: string): Map<string, string> {
  const seen = new Map<string, string>(); // eventId → canonical url
  let m: RegExpExecArray | null;
  const re = new RegExp(EB_EVENT_URL_RE.source, "g");
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const id = extractIdFromUrl(url);
    if (id && !seen.has(id)) seen.set(id, url);
  }
  return seen;
}

// ─── Strategy B: JSON-LD ──────────────────────────────────────────────────────
// Eventbrite populates <script type="application/ld+json"> for SEO.
// Shapes vary: a single @type:"Event", an @type:"ItemList" wrapping events,
// or an array of mixed items. We handle all three.
// This is the most semantically stable source when present.

function extractFromJsonLd(html: string): Map<string, Partial<EventCard>> {
  const result = new Map<string, Partial<EventCard>>();
  const scriptRe =
    /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      visitLdNode(item, result);
    }
  }
  return result;
}

function visitLdNode(
  node: unknown,
  result: Map<string, Partial<EventCard>>
) {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;

  // @type: "ItemList" — recurse into itemListElement entries.
  if (obj["@type"] === "ItemList" && Array.isArray(obj.itemListElement)) {
    for (const el of obj.itemListElement as unknown[]) {
      const inner =
        el && typeof el === "object"
          ? ((el as Record<string, unknown>).item ?? el)
          : el;
      visitLdNode(inner, result);
    }
    return;
  }

  // @type: "Event" — extract fields.
  if (obj["@type"] === "Event" && typeof obj.url === "string") {
    const id = extractIdFromUrl(obj.url);
    if (!id || result.has(id)) return;
    result.set(id, {
      sourceEventId: id,
      sourceUrl: obj.url,
      title: typeof obj.name === "string" ? obj.name.trim() || null : null,
      startAt: toIso(obj.startDate),
      imageUrl: ldImage(obj.image),
      venueName: ldVenueName(obj.location),
      isFree: ldIsFree(obj.offers),
    });
  }
}

function ldImage(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return typeof o.url === "string" ? o.url || null : null;
  }
  return null;
}

function ldVenueName(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return typeof o.name === "string" ? o.name.trim() || null : null;
}

function ldIsFree(v: unknown): boolean {
  if (!v) return false;
  const list = Array.isArray(v) ? v : [v];
  return list.some((offer) => {
    if (!offer || typeof offer !== "object") return false;
    const o = offer as Record<string, unknown>;
    return (
      o.price === "0" ||
      o.price === 0 ||
      o.isAccessibleForFree === true
    );
  });
}

// ─── Strategy C: embedded JSON in <script> tags ───────────────────────────────
// Eventbrite listing pages embed event data in window.__SERVER_DATA__ under
// the path search_data.events.results[].
// Each result has split date/time fields: start_date ("YYYY-MM-DD") + start_time ("HH:MM").
//
// Note: the previous regex approach (\{[\s\S]*?\}) used a lazy quantifier that
// stops at the first "}" in a nested JSON object, producing malformed JSON that
// always fails JSON.parse. We now extract via script-tag content scan instead.

function extractFromEmbeddedJson(html: string): Map<string, Partial<EventCard>> {
  const result = new Map<string, Partial<EventCard>>();

  // application/json script tags (covers data-component-name patterns)
  const jsonScriptRe =
    /<script[^>]+type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = jsonScriptRe.exec(html)) !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch {
      continue;
    }
    walkForEvents(parsed, result);
  }

  // window.__SERVER_DATA__ — find the script tag containing it, then extract
  // the JSON by slicing from the first "{" after "=" to end of script content.
  // This avoids the nested-braces problem that breaks regex-based capture.
  const serverData = extractWindowServerData(html);
  if (serverData) walkForEvents(serverData, result);

  return result;
}

// Scan all inline <script> tags for `window.__SERVER_DATA__ = {...}`.
// Returns the parsed object, or null if not found / not parseable.
function extractWindowServerData(html: string): unknown | null {
  const scriptTagRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptTagRe.exec(html)) !== null) {
    const content = m[1];
    if (!content.includes("window.__SERVER_DATA__")) continue;
    const assignIdx = content.indexOf("window.__SERVER_DATA__");
    const eqIdx = content.indexOf("=", assignIdx);
    if (eqIdx === -1) continue;
    const jsonStart = content.indexOf("{", eqIdx);
    if (jsonStart === -1) continue;
    // Trim trailing ";" or whitespace that appears after the JSON object.
    const jsonStr = content.slice(jsonStart).replace(/;\s*$/, "").trim();
    try {
      return JSON.parse(jsonStr);
    } catch {
      continue;
    }
  }
  return null;
}

// Recursively walk a JSON tree looking for objects that look like Eventbrite events.
// We recognise an event by the presence of an Eventbrite event URL plus any date field.
function walkForEvents(
  node: unknown,
  result: Map<string, Partial<EventCard>>,
  depth = 0
) {
  // Limit recursion depth to avoid performance issues on very large blobs.
  if (depth > 12 || !node || typeof node !== "object") return;

  if (Array.isArray(node)) {
    for (const item of node) walkForEvents(item, result, depth + 1);
    return;
  }

  const obj = node as Record<string, unknown>;

  // Recognise an event object by URL (preferred) or Eventbrite's numeric "eid" field.
  // search_data.events.results[] uses "eid" not "url", so we must support both.
  const rawUrl =
    typeof obj.url === "string"
      ? obj.url
      : typeof obj.source_url === "string"
        ? obj.source_url
        : null;

  const id =
    (rawUrl ? extractIdFromUrl(rawUrl) : null) ??
    (typeof obj.eid === "string" ? obj.eid : null) ??
    (typeof obj.eid === "number" ? String(obj.eid) : null);

  if (id && !result.has(id)) {
    {
      // Try the many field-name shapes Eventbrite has used across versions.
      // search_data.events.results[] uses split fields: start_date + start_time.
      // These must be combined and converted to UTC using Montreal's local offset.
      const startAt =
        toIso(dig(obj, "start", "utc")) ??
        toIso(dig(obj, "start", "local")) ??
        toIso(obj.startDate) ??
        montrealLocalToUtc(obj.start_date, obj.start_time) ??
        null;

      // Debug: log the first matched event's raw fields to confirm the source path.
      if (result.size === 0) {
        console.debug("[eventbrite] sample embedded event:", {
          id,
          hasUrl: !!rawUrl,
          eid: obj.eid,
          start_date: obj.start_date,
          start_time: obj.start_time,
          startDate: obj.startDate,
          resolvedStartAt: startAt,
          name: obj.name,
        });
      }

      const title =
        (typeof dig(obj, "name", "text") === "string"
          ? (dig(obj, "name", "text") as string).trim()
          : null) ??
        (typeof obj.name === "string" ? obj.name.trim() : null) ??
        (typeof obj.title === "string" ? obj.title.trim() : null) ??
        null;

      const imageUrl =
        (typeof dig(obj, "logo", "original", "url") === "string"
          ? (dig(obj, "logo", "original", "url") as string)
          : null) ??
        (typeof dig(obj, "logo", "url") === "string"
          ? (dig(obj, "logo", "url") as string)
          : null) ??
        (typeof obj.image_url === "string" ? obj.image_url : null) ??
        null;

      const venueName =
        typeof dig(obj, "venue", "name") === "string"
          ? ((dig(obj, "venue", "name") as string).trim() || null)
          : null;

      const isFree =
        obj.is_free === true ||
        dig(obj, "ticket_availability", "is_free") === true;

      if (startAt || title) {
        result.set(id, {
          sourceEventId: id,
          sourceUrl: rawUrl ?? undefined,
          title: title || null,
          imageUrl,
          startAt,
          venueName,
          isFree: isFree as boolean,
        });
      }
    }
  }

  // Recurse into well-known container keys only (avoids walking entire page state).
  // search_data is the top-level key in window.__SERVER_DATA__ that holds results.
  const containerKeys = [
    "search_data",
    "events",
    "results",
    "items",
    "data",
    "props",
    "pageProps",
    "serverPayload",
    "search",
    "organicEvents",
  ];
  for (const key of containerKeys) {
    if (key in obj) walkForEvents(obj[key], result, depth + 1);
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// Convert a datetime string to ISO 8601 UTC.
//
// IMPORTANT: bare date strings (YYYY-MM-DD) are explicitly rejected and return
// null. JavaScript's Date constructor parses them as UTC midnight, which shifts
// the displayed time 4-5 hours earlier in Montréal — e.g. "2026-03-27" becomes
// 2026-03-26T20:00:00 EDT. If only a date is available with no reliable time we
// skip the event rather than store a silently wrong timestamp.
//
// Accepted:
//   "2026-03-28T01:00:00Z"          — UTC (start.utc, ideal)
//   "2026-03-27T21:00:00-04:00"     — explicit offset (JSON-LD startDate)
// Rejected:
//   "2026-03-27"                    — date-only, ambiguous
function toIso(v: unknown): string | null {
  if (!v || typeof v !== "string") return null;
  // Reject bare YYYY-MM-DD — no time component means no safe UTC conversion.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Convert a Montréal local date + time to a UTC ISO string.
//
// Eventbrite's search_data splits datetime into:
//   start_date: "YYYY-MM-DD"  (calendar date in Montréal local time)
//   start_time: "HH:MM"       (wall-clock time in Montréal local time)
//
// To convert correctly (including DST), we use the same Intl trick as
// EventsList.montrealDayStart: place noon UTC on that date, measure how many
// hours Montréal local time lags behind noon UTC to find local midnight in UTC,
// then add the event's wall-clock hours/minutes.
function montrealLocalToUtc(date: unknown, time: unknown): string | null {
  if (typeof date !== "string" || typeof time !== "string") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch) return null;
  const eventHours = Number(timeMatch[1]);
  const eventMinutes = Number(timeMatch[2]);

  // Noon UTC on the given calendar date — unambiguously within the correct DST period.
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

  // UTC timestamp of local midnight on this date.
  const midnightUtcMs =
    noonUtc.getTime() - (noonLocalH * 3600 + noonLocalM * 60 + noonLocalS) * 1000;

  // Add the event's wall-clock offset from midnight.
  const eventUtcMs = midnightUtcMs + (eventHours * 3600 + eventMinutes * 60) * 1000;
  return new Date(eventUtcMs).toISOString();
}

// Safe nested property accessor.
function dig(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Strategy D: <time datetime="..."> near event URL anchors ─────────────────
// Eventbrite listing cards contain a <time> element with a machine-readable
// datetime attribute formatted as "YYYY-MM-DDTHH:MM:SS" in Montréal local time
// (no timezone suffix on listing pages). This is a reliable fallback when
// JSON-LD only carries a bare date and embedded JSON is absent.

function extractFromCardTime(
  html: string,
  urlMap: Map<string, string>
): Map<string, { startAt: string; rawDatetime: string }> {
  const result = new Map<string, { startAt: string; rawDatetime: string }>();

  for (const [id, url] of urlMap.entries()) {
    const urlPos = html.indexOf(url);
    if (urlPos === -1) continue;

    // Look 2 000 chars before the link (date header precedes the anchor in the card)
    // and 1 000 chars after (in case the layout places date below the title).
    const windowStart = Math.max(0, urlPos - 2000);
    const windowEnd = Math.min(html.length, urlPos + 1000);
    const slice = html.slice(windowStart, windowEnd);

    const timeRe = /<time[^>]+datetime="([^"]+)"[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = timeRe.exec(slice)) !== null) {
      const raw = m[1];
      // Require a time component — bare dates are ambiguous for UTC conversion.
      if (!/[T ]\d{2}:\d{2}/.test(raw)) continue;
      const startAt = montrealLocalDatetimeToUtc(raw);
      if (!startAt) continue;
      result.set(id, { startAt, rawDatetime: raw });
      break;
    }
  }

  return result;
}

// Parse "YYYY-MM-DDTHH:MM" or "YYYY-MM-DDTHH:MM:SS" as Montréal local time → UTC ISO.
function montrealLocalDatetimeToUtc(dt: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(dt);
  if (!m) return null;
  return montrealLocalToUtc(m[1], m[2]);
}

// ─── Strategy E: Visible card text date/time ──────────────────────────────────
// When all machine-readable sources fail, parse the human-visible date string
// rendered on each listing card by Eventbrite.
//
// Two observed patterns (English listing pages, Montréal):
//   Pattern A: "Fri, Mar 27, 9:00 PM"        — standard, most events
//   Pattern B: "Sunday at 9:00 PM"            — imminent events (relative day-of-week)
//              "Tomorrow at 10:00 PM"         — next-day events
//
// All times are Montréal local (no timezone suffix in the card text).

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// "Fri, Mar 27, 9:00 PM" or "Fri, Mar 27, 2026, 9:00 PM"
const CARD_DATE_A =
  /(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s+(\d{4}))?,\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

// "Sunday at 9:00 PM" / "Tomorrow at 10:00 PM" / "Today at 8:00 PM"
const CARD_DATE_B =
  /\b(Today|Tomorrow|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i;

const DOW_MAP: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tuesday: 2,
  wed: 3, wednesday: 3, thu: 4, thursday: 4, fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

// Resolve a relative day-of-week word to a "YYYY-MM-DD" date string (UTC-based).
function dateForRelativeWord(word: string): string | null {
  const key = word.toLowerCase();
  const now = new Date();
  if (key === "today") return now.toISOString().slice(0, 10);
  if (key === "tomorrow") return new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const targetDow = DOW_MAP[key];
  if (targetDow === undefined) return null;
  const daysAhead = (targetDow - now.getUTCDay() + 7) % 7;
  return new Date(now.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);
}

function parseVisibleCardDate(
  text: string
): { startAt: string; rawText: string } | null {
  // Try Pattern A first ("Fri, Mar 27, 9:00 PM").
  const mA = CARD_DATE_A.exec(text);
  if (mA) {
    const [matched, , monthStr, dayStr, yearStr, hourStr, minStr, ampm] = mA;
    const month = MONTH_ABBR[monthStr.slice(0, 3).toLowerCase()];
    if (month) {
      const day = parseInt(dayStr, 10);
      let year: number;
      if (yearStr) {
        year = parseInt(yearStr, 10);
      } else {
        // Infer year: if the month/day is more than 14 days in the past, use next year.
        const nowMs = Date.now();
        const thisYear = new Date().getFullYear();
        const candidate = new Date(thisYear, month - 1, day);
        year = candidate.getTime() < nowMs - 14 * 86400000 ? thisYear + 1 : thisYear;
      }
      let hour = parseInt(hourStr, 10);
      const min = parseInt(minStr, 10);
      if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
      if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const timeStr = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const startAt = montrealLocalToUtc(dateStr, timeStr);
      if (startAt) return { startAt, rawText: matched.trim() };
    }
  }

  // Try Pattern B ("Sunday at 9:00 PM" / "Tomorrow at 10:00 PM").
  const mB = CARD_DATE_B.exec(text);
  if (mB) {
    const [matched, dayWord, hourStr, minStr, ampm] = mB;
    const dateStr = dateForRelativeWord(dayWord);
    if (dateStr) {
      let hour = parseInt(hourStr, 10);
      const min = parseInt(minStr, 10);
      if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
      if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;
      const timeStr = `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      const startAt = montrealLocalToUtc(dateStr, timeStr);
      if (startAt) return { startAt, rawText: matched.trim() };
    }
  }

  return null;
}

function extractFromVisibleText(
  html: string,
  urlMap: Map<string, string>
): Map<string, { startAt: string; rawText: string }> {
  const result = new Map<string, { startAt: string; rawText: string }>();

  for (const [id, url] of urlMap.entries()) {
    const urlPos = html.indexOf(url);
    if (urlPos === -1) continue;

    // Date text always appears AFTER the link in Eventbrite card markup.
    const windowEnd = Math.min(html.length, urlPos + 3000);
    const slice = html.slice(urlPos, windowEnd);

    // Strip HTML tags and decode basic entities to get visible text.
    const text = slice
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&[a-zA-Z]+;/g, " ")
      .replace(/\s+/g, " ");

    const parsed = parseVisibleCardDate(text);
    if (!parsed) continue;
    result.set(id, parsed);
  }

  return result;
}

// ─── Merge strategies ─────────────────────────────────────────────────────────
// Priority: JSON-LD (most stable) > embedded JSON > card <time> > visible text.

function buildCards(html: string): EventCard[] {
  const urlMap = extractEventUrls(html);
  const ldMap = extractFromJsonLd(html);
  const embMap = extractFromEmbeddedJson(html);
  const ctMap = extractFromCardTime(html, urlMap);
  const vtMap = extractFromVisibleText(html, urlMap);

  console.log(
    `[eventbrite] links=${urlMap.size} jsonld=${ldMap.size} embedded=${embMap.size} cardtime=${ctMap.size} vistext=${vtMap.size}`
  );

  // Union all IDs across strategies so eid-only events (no href in HTML) are included.
  const allIds = new Set([...urlMap.keys(), ...ldMap.keys(), ...embMap.keys()]);
  if (allIds.size === 0) return [];

  let debuggedSample = false;

  return Array.from(allIds).map((id) => {
    const url = urlMap.get(id) ?? null;
    const ld = ldMap.get(id) ?? {};
    const emb = embMap.get(id) ?? {};
    const ct = ctMap.get(id);
    const vt = vtMap.get(id);
    // Construct a canonical fallback URL when the event was found only via eid.
    const fallbackUrl = `https://www.eventbrite.ca/e/tickets-${id}`;

    const startAt = ld.startAt ?? emb.startAt ?? ct?.startAt ?? vt?.startAt ?? null;

    // Debug first card where visible-text is the only startAt source.
    if (!debuggedSample && vt && !ld.startAt && !emb.startAt && !ct?.startAt) {
      debuggedSample = true;
      console.log("[eventbrite] sample vistext:", {
        id,
        rawText: vt.rawText,
        resolvedStartAt: vt.startAt,
        source: "visible-text",
      });
    }

    return {
      sourceEventId: id,
      sourceUrl: ld.sourceUrl ?? emb.sourceUrl ?? url ?? fallbackUrl,
      title: ld.title ?? emb.title ?? null,
      imageUrl: ld.imageUrl ?? emb.imageUrl ?? null,
      startAt,
      venueName: ld.venueName ?? emb.venueName ?? null,
      isFree: ld.isFree ?? emb.isFree ?? false,
    };
  });
}

// ─── Main ingest function ─────────────────────────────────────────────────────

export async function ingestEventbriteMontreal(
  options: IngestOptions
): Promise<IngestResult> {
  const maxPagesSafe =
    Number.isFinite(options.maxPages) && options.maxPages > 0
      ? Math.floor(options.maxPages)
      : 2;

  const supabase = supabaseServer();

  // Record run start — same pattern as Ticketmaster.
  const { data: runRow } = await supabase
    .from("ingest_runs")
    .insert({
      source: "eventbrite",
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
  let venuesUpserted = 0;
  let pagesProcessed = 0;
  // Tracks IDs already upserted this run so the same event in multiple
  // categories doesn't overwrite itself (first category wins).
  const seenIds = new Set<string>();
  const categoryStats: CategoryStats[] = [];

  try {
    const categoriesToRun = options.categoryFilter
      ? CATEGORIES.filter((c) => options.categoryFilter!.includes(c.slug))
      : CATEGORIES;

    for (const { slug, category } of categoriesToRun) {
      const catStat: CategoryStats = {
        slug,
        category,
        pages: 0,
        cards: 0,
        ingested: 0,
        skipped: 0,
        skipReasons: { missingSourceEventId: 0, missingTitle: 0, missingStartAt: 0, duplicate: 0 },
      };

      for (let page = 1; page <= maxPagesSafe; page++) {
        let html: string;
        try {
          html = await fetchListingPage(slug, page);
        } catch (err) {
          // A single page failure is non-fatal — log and continue.
          console.error(`[eventbrite] ${slug} page ${page} fetch error:`, err);
          continue;
        }

        const cards = buildCards(html);

        // No cards on this page means we've gone past the last page.
        if (cards.length === 0) break;

        catStat.cards += cards.length;

        for (const card of cards) {
          if (!card.sourceEventId) {
            catStat.skipReasons.missingSourceEventId += 1;
            catStat.skipped += 1;
            skipped += 1;
            continue;
          }
          if (seenIds.has(card.sourceEventId)) {
            catStat.skipReasons.duplicate += 1;
            continue;
          }
          if (!card.title) {
            catStat.skipReasons.missingTitle += 1;
            catStat.skipped += 1;
            skipped += 1;
            continue;
          }
          if (!card.startAt) {
            catStat.skipReasons.missingStartAt += 1;
            catStat.skipped += 1;
            skipped += 1;
            continue;
          }

          // Venue upsert is optional and non-fatal.
          let venueId: string | null = null;
          if (card.venueName) {
            try {
              const result = await upsertVenue(supabase, {
                name: card.venueName,
                address_line1: null, // listing pages don't provide street address
                city: "Montréal",
                region: "QC",
                country: "CA",
                timezone: "America/Toronto",
              });
              if (result) {
                venueId = result.id;
                if (result.isNew) venuesUpserted += 1;
              }
            } catch (err) {
              console.warn(`[eventbrite] venue upsert failed for "${card.venueName}":`, err);
            }
          }

          const { error } = await supabase.from("events").upsert(
            {
              title: card.title,
              title_normalized: normalizeText(card.title),
              description: null,
              start_at: card.startAt,
              end_at: null,
              timezone: "America/Toronto",
              status: "scheduled",
              category_primary: category,
              tags: [],
              min_price: card.isFree ? 0 : null,
              max_price: null,
              currency: "CAD",
              age_restriction: null,
              image_url: card.imageUrl,
              source: "eventbrite",
              source_event_id: card.sourceEventId,
              source_url: card.sourceUrl,
              venue_id: venueId,
              city_normalized: "montreal",
              is_approved: true,
            },
            { onConflict: "source,source_event_id" }
          );

          if (error) throw error;
          seenIds.add(card.sourceEventId);
          catStat.ingested += 1;
          ingested += 1;
        }

        catStat.pages += 1;
        pagesProcessed += 1;

        // Polite delay between listing page fetches.
        await sleep(300);
      }

      console.log(`[eventbrite] ${slug}:`, catStat);
      categoryStats.push(catStat);
    }

    await finishRun({
      status: "success",
      ingested_count: ingested,
      skipped_count: skipped,
      venues_upserted: venuesUpserted,
    });

    return { ok: true, ingested, skipped, venuesUpserted, pagesProcessed, runId, categories: categoryStats };
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

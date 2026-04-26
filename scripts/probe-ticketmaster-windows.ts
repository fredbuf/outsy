/**
 * Probe script — read-only Ticketmaster window analysis.
 * Fetches page metadata and event names for each date window.
 * Does NOT write to the database.
 *
 * Usage:
 *   npx tsx scripts/probe-ticketmaster-windows.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const API_KEY = process.env.TICKETMASTER_API_KEY;
if (!API_KEY) throw new Error("Missing TICKETMASTER_API_KEY in .env.local");

const BASE_PARAMS = {
  apikey: API_KEY,
  locale: "*",
  latlong: "45.5019,-73.5674",
  radius: "35",
  unit: "km",
  sort: "date,asc",
  classificationName: "music,arts,sports",
  size: "100",
} as const;

type PageMeta = {
  totalPages: number;
  totalElements: number | null;
  eventsOnPage: number;
  eventNames: string[];
};

async function fetchPage(page: number, startDateTime: string, endDateTime: string): Promise<PageMeta> {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  for (const [k, v] of Object.entries(BASE_PARAMS)) url.searchParams.set(k, v);
  url.searchParams.set("page", String(page));
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TM API error ${res.status}: ${body}`);
  }
  const json = await res.json();
  const events: Array<{ name?: string }> = json?._embedded?.events ?? [];
  return {
    totalPages: json?.page?.totalPages ?? 0,
    totalElements: json?.page?.totalElements ?? null,
    eventsOnPage: events.length,
    eventNames: events.map((e) => e?.name ?? "(unnamed)"),
  };
}

type WindowResult = {
  label: string;
  startDateTime: string;
  endDateTime: string;
  totalPages: number;
  totalElements: number | null;
  pagesScanned: number;
  totalEventsSeen: number;
  danielCaesarFound: boolean;
  danielCaesarDetails: string[];
  fitsInThreePages: boolean;
};

async function probeWindow(
  label: string,
  startDateTime: string,
  endDateTime: string,
  maxPagesToScan = 10,
): Promise<WindowResult> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Window: ${label}`);
  console.log(`  ${startDateTime}  →  ${endDateTime}`);

  let page = 0;
  let totalPages = 1;
  let totalElements: number | null = null;
  let totalEventsSeen = 0;
  const danielCaesarDetails: string[] = [];

  while (page < totalPages && page < maxPagesToScan) {
    const meta = await fetchPage(page, startDateTime, endDateTime);
    totalPages = meta.totalPages;
    if (meta.totalElements !== null) totalElements = meta.totalElements;
    totalEventsSeen += meta.eventsOnPage;

    // Scan for Daniel Caesar (case-insensitive)
    for (const name of meta.eventNames) {
      if (name.toLowerCase().includes("daniel caesar")) {
        danielCaesarDetails.push(`page=${page} → "${name}"`);
      }
    }

    console.log(
      `  page=${page} eventsReturned=${meta.eventsOnPage}` +
      ` totalPages=${totalPages} totalElements=${totalElements ?? "n/a"}`
    );

    page += 1;
    // Small delay to respect rate limits between pages
    if (page < totalPages && page < maxPagesToScan) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const result: WindowResult = {
    label,
    startDateTime,
    endDateTime,
    totalPages,
    totalElements,
    pagesScanned: page,
    totalEventsSeen,
    danielCaesarFound: danielCaesarDetails.length > 0,
    danielCaesarDetails,
    fitsInThreePages: totalPages <= 3,
  };

  console.log(`  ✓ totalPages=${totalPages} totalElements=${totalElements ?? "n/a"} fitsIn3Pages=${result.fitsInThreePages}`);
  if (result.danielCaesarFound) {
    console.log(`  🎵 Daniel Caesar FOUND: ${danielCaesarDetails.join(", ")}`);
  }

  return result;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19) + "Z";
}

async function main() {
  const now = isoOffset(0);

  const windows: Array<[string, string, string]> = [
    ["W1: now → 30d",  now,             isoOffset(30)],
    ["W2: 31 → 90d",   isoOffset(31),   isoOffset(90)],
    ["W3: 91 → 180d",  isoOffset(91),   isoOffset(180)],
    ["W4: 181 → 270d", isoOffset(181),  isoOffset(270)],
  ];

  const results: WindowResult[] = [];
  for (const [label, start, end] of windows) {
    const r = await probeWindow(label, start, end);
    results.push(r);
    // Pause between windows to avoid rate-limit burst
    await new Promise((r2) => setTimeout(r2, 500));
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log("SUMMARY");
  console.log("═".repeat(60));
  console.log(
    `${"Window".padEnd(18)} ${"totalEl".padStart(8)} ${"totPg".padStart(6)} ${"scanned".padStart(8)} ${"fits3".padStart(6)} ${"DanielC".padStart(8)}`
  );
  console.log("─".repeat(60));
  for (const r of results) {
    console.log(
      `${r.label.padEnd(18)}` +
      ` ${String(r.totalElements ?? "n/a").padStart(8)}` +
      ` ${String(r.totalPages).padStart(6)}` +
      ` ${String(r.pagesScanned).padStart(8)}` +
      ` ${String(r.fitsInThreePages).padStart(6)}` +
      ` ${String(r.danielCaesarFound).padStart(8)}`
    );
    if (r.danielCaesarDetails.length > 0) {
      for (const d of r.danielCaesarDetails) console.log(`  → ${d}`);
    }
  }

  const danielFound = results.some((r) => r.danielCaesarFound);
  if (!danielFound) {
    console.log("\n⚠ Daniel Caesar at Centre Bell (Aug 6 2026) NOT found in any window.");
    console.log("  Possible reasons: not yet on Ticketmaster, outside radius, different classification.");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

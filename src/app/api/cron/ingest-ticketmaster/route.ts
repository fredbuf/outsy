import "server-only";
import { NextResponse } from "next/server";
import { ingestTicketmasterMontreal } from "@/lib/ingestion-ticketmaster";

// ─── Vercel Hobby plan constraints ────────────────────────────────────────────
// Ticketmaster returns ~850 Montreal events across a 9-month window (~10 pages
// at size=100).  Fetching all pages in one serverless invocation risks a Vercel
// timeout.  The Hobby plan supports up to 100 cron jobs, but each job may run
// at most once per day — sub-daily intervals require Pro.
//
// Workaround: ingestion is split into four rolling date-window crons defined in
// vercel.json.  Each cron covers a narrower slice of the calendar that fits
// within 3–4 pages and completes well inside the timeout budget.  All four
// windows run at most once per day, so they are Hobby-compatible.
//
//   W1  0– 30 days  daily           maxPages=3  (~176 events)
//   W2  31– 90 days daily           maxPages=4  (~262 events)  ← extra page margin
//   W3  91–180 days Mon + Thu       maxPages=3  (~280 events)
//   W4 181–270 days Mon             maxPages=3  (~133 events)
//
// maxPages is intentionally capped per window, not raised globally.  Raising it
// on a single wide window would still risk timeouts and rate-limit bursts.
//
// When upgrading to Vercel Pro:
//   - Add a "recently announced" sweep running multiple times per day using
//     sales.public.startDateTime so newly listed events appear within hours.
//   - Consolidate into fewer jobs or a single orchestrated job if desired.
//   - See docs/ingestion.md for the full plan.
// ─────────────────────────────────────────────────────────────────────────────

// Vercel cron calls this endpoint on schedule.
// Keep it as GET for easy cron setup, even though it mutates data.
export async function GET(req: Request) {
  const url = new URL(req.url);

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const expectedBearer = `Bearer ${cronSecret}`;

  const isAuthorized = authHeader === expectedBearer;
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Clamp inputs to prevent accidental/malicious heavy requests.
  const maxPages = Math.min(Math.max(Number(url.searchParams.get("maxPages") ?? "3"), 1), 10);
  const size = Math.min(Math.max(Number(url.searchParams.get("size") ?? "100"), 10), 200);

  // Rolling date-window support.
  // startOffset / endOffset are integer days from now.  When omitted the cron
  // falls back to the library defaults (now → now+9 months) so existing behaviour
  // is preserved if the params are ever stripped from the URL.
  const startOffsetParam = url.searchParams.get("startOffset");
  const endOffsetParam = url.searchParams.get("endOffset");

  let startDateTime: string | undefined;
  let endDateTime: string | undefined;

  if (startOffsetParam !== null || endOffsetParam !== null) {
    const startOffsetDays = Math.max(0, Number(startOffsetParam ?? "0"));
    const endOffsetDays = Math.max(1, Number(endOffsetParam ?? "270"));

    const now = Date.now();
    const MS_PER_DAY = 86_400_000;

    const startDate = new Date(now + startOffsetDays * MS_PER_DAY);
    const endDate = new Date(now + endOffsetDays * MS_PER_DAY);

    startDateTime = startDate.toISOString().slice(0, 19) + "Z";
    endDateTime = endDate.toISOString().slice(0, 19) + "Z";
  }

  try {
    const result = await ingestTicketmasterMontreal({ maxPages, size, startDateTime, endDateTime });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ingestion failed",
      },
      { status: 500 }
    );
  }
}
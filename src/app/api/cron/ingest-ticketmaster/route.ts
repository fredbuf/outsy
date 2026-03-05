import "server-only";
import { NextResponse } from "next/server";
import { ingestTicketmasterMontreal } from "@/lib/ingestion-ticketmaster";

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

  // Allow query fallback ONLY for local/dev testing (avoid leaking secrets in URLs)
  const queryKey =
    process.env.NODE_ENV !== "production" ? url.searchParams.get("key") : null;

  const isAuthorized = authHeader === expectedBearer || queryKey === cronSecret;
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Clamp inputs to prevent accidental/malicious heavy requests
  const maxPages = Math.min(Math.max(Number(url.searchParams.get("maxPages") ?? "3"), 1), 10);
  const size = Math.min(Math.max(Number(url.searchParams.get("size") ?? "50"), 10), 200);

  try {
    const result = await ingestTicketmasterMontreal({ maxPages, size });
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
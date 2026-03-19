import "server-only";
import { NextResponse } from "next/server";
import { ingestNewCityGas } from "@/lib/ingestion-venue-newcitygas";

// Vercel cron calls this endpoint on schedule.
// Keep it as GET for easy cron setup, even though it mutates data.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const expectedBearer = `Bearer ${cronSecret}`;

  // Allow query fallback ONLY for local/dev testing (avoid leaking secrets in URLs)
  const url = new URL(req.url);
  const queryKey =
    process.env.NODE_ENV !== "production" ? url.searchParams.get("key") : null;

  const isAuthorized = authHeader === expectedBearer || queryKey === cronSecret;
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestNewCityGas();
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

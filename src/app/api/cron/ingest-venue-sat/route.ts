import "server-only";
import { NextResponse } from "next/server";
import { ingestSatMontreal } from "@/lib/ingestion-venue-sat";

// Vercel cron calls this endpoint on schedule.
// Keep it as GET for easy cron setup, even though it mutates data.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const expectedBearer = `Bearer ${cronSecret}`;

  const url = new URL(req.url);

  const isAuthorized = authHeader === expectedBearer;
  if (!isAuthorized) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Clamp to prevent accidental/malicious heavy requests.
  const maxEvents = Math.min(
    Math.max(Number(url.searchParams.get("maxEvents") ?? "60"), 1),
    200
  );

  try {
    const result = await ingestSatMontreal({ maxEvents });
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

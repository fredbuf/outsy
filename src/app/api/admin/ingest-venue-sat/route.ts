import "server-only";
import { NextResponse } from "next/server";
import { ingestSatMontreal } from "@/lib/ingestion-venue-sat";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.INGEST_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: missing INGEST_SECRET" },
      { status: 500 }
    );
  }

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const maxEvents = Math.min(
    Math.max(Number(url.searchParams.get("maxEvents") ?? "60"), 1),
    200
  );

  try {
    const result = await ingestSatMontreal({ maxEvents });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("SAT ingest failed:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

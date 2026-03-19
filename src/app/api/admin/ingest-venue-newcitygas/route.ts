import "server-only";
import { NextResponse } from "next/server";
import { ingestNewCityGas } from "@/lib/ingestion-venue-newcitygas";

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

  try {
    const result = await ingestNewCityGas();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("New City Gas ingest failed:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

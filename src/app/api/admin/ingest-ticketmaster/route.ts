import "server-only";
import { NextResponse } from "next/server";
import { ingestTicketmasterMontreal } from "@/lib/ingestion-ticketmaster";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const secret = process.env.INGEST_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: missing INGEST_SECRET" },
      { status: 500 }
    );
  }

  const expected = `Bearer ${secret}`;
  if (auth !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const maxPages = Number(url.searchParams.get("maxPages") ?? "1");
  const size = Number(url.searchParams.get("size") ?? "50");

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

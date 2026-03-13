import "server-only";
import { NextResponse } from "next/server";
import { ingestEventbriteMontreal } from "@/lib/ingestion-eventbrite";

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
  const maxPages = Math.max(1, Number(url.searchParams.get("maxPages") ?? "1"));

  // Default to music-only (the only validated category).
  // Pass ?categories=music--events,nightlife--events to override for debugging.
  const categoriesParam = url.searchParams.get("categories");
  const categoryFilter = categoriesParam
    ? categoriesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : ["music--events"];

  try {
    const result = await ingestEventbriteMontreal({ maxPages, categoryFilter });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Eventbrite ingest failed:", error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

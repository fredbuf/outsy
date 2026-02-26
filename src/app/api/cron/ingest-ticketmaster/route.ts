import "server-only";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: missing CRON_SECRET" },
      { status: 500 }
    );
  }

  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Call your existing protected admin endpoint internally
  const baseUrl =
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/admin/ingest-ticketmaster?maxPages=3`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.INGEST_SECRET}`,
    },
    cache: "no-store",
  });

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "content-type": "application/json" },
  });
}
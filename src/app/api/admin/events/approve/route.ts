import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const event_id = (body as Record<string, unknown>).event_id;
  if (!event_id || typeof event_id !== "string" || !event_id.trim()) {
    return NextResponse.json({ ok: false, error: "event_id is required." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("events")
    .update({ is_approved: true })
    .eq("id", event_id.trim())
    .select("id,title,is_approved")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Approval failed: ${error.message}` },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, event: data });
}

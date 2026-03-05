import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: Request) {
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

  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("events")
    .select(
      "id,title,start_at,category_primary,source_url,created_at,venues(name)"
    )
    .eq("is_approved", false)
    .eq("is_rejected", false)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Query failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, events: data ?? [] });
}

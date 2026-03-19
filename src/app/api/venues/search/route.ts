import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText } from "@/lib/ingestion-shared";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ venues: [] });
  }

  const normalized = normalizeText(q);
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("venues")
    .select("id, name, city, address_line1")
    .ilike("name_normalized", `%${normalized}%`)
    .order("name")
    .limit(6);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ venues: data ?? [] });
}

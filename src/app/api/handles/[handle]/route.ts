import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle: raw } = await params;

  // Normalize: trim whitespace, strip leading @, lowercase.
  const handle = raw.trim().replace(/^@/, "").toLowerCase();

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { available: false, reason: "invalid", handle },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseServer()
    .from("handles")
    .select("owner_type")
    .eq("handle", handle)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { available: false, reason: "error", handle },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ available: true, handle });
  }

  const reason = data.owner_type === "reserved" ? "reserved" : "taken";
  return NextResponse.json({ available: false, reason, handle });
}

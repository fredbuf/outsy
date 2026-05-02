import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/organizers/[id]/follow
// Returns { ok: true, following: boolean } for the authenticated user.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const { data } = await supabaseServer()
    .from("organizer_followers")
    .select("user_id")
    .eq("organizer_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, following: !!data });
}

// POST /api/organizers/[id]/follow
// Follow the organizer. Idempotent.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const supabase = supabaseServer();

  // Verify organizer exists
  const { data: org } = await supabase
    .from("organizers")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });

  const { error } = await supabase
    .from("organizer_followers")
    .upsert({ organizer_id: orgId, user_id: user.id }, { onConflict: "organizer_id,user_id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: true });
}

// DELETE /api/organizers/[id]/follow
// Unfollow the organizer. Idempotent.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const { error } = await supabaseServer()
    .from("organizer_followers")
    .delete()
    .eq("organizer_id", orgId)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: false });
}

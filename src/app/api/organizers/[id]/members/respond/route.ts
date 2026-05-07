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

// POST /api/organizers/[id]/members/respond
// Called by the invited user to accept or decline their pending invite.
// Accept: sets status = "active".
// Decline: deletes the row (allows future re-invite).

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const action =
    payload.action === "accept" ? "accept"
    : payload.action === "decline" ? "decline"
    : null;
  if (!action)
    return NextResponse.json({ ok: false, error: "action must be 'accept' or 'decline'." }, { status: 400 });

  const supabase = supabaseServer();

  // Verify there is a pending invite for this user.
  const { data: invite } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", id)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .maybeSingle();

  if (!invite)
    return NextResponse.json({ ok: false, error: "No pending invite found." }, { status: 404 });

  if (action === "accept") {
    const { error } = await supabase
      .from("organizer_members")
      .update({ status: "active" })
      .eq("organizer_id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error("[POST /api/organizers/[id]/members/respond] accept", error.message);
      return NextResponse.json({ ok: false, error: "Failed to accept invite." }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("organizer_members")
      .delete()
      .eq("organizer_id", id)
      .eq("user_id", user.id);
    if (error) {
      console.error("[POST /api/organizers/[id]/members/respond] decline", error.message);
      return NextResponse.json({ ok: false, error: "Failed to decline invite." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, action });
}

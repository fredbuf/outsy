import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST /api/friends/remove
// Body: { friendshipId: string }
// Requires: Authorization: Bearer <token>
//
// Deletes the friendship row. Caller must be either the requester or recipient.
// Works for all statuses: pending (cancel) or accepted (unfriend).
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { friendshipId } = body as Record<string, unknown>;
  if (typeof friendshipId !== "string" || !friendshipId.trim()) {
    return NextResponse.json({ ok: false, error: "friendshipId is required." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify the row exists and caller is a party to it
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id,requester_id,recipient_id")
    .eq("id", friendshipId)
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json({ ok: false, error: "Friendship not found." }, { status: 404 });
  }

  if (friendship.requester_id !== user.id && friendship.recipient_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);

  if (deleteError) {
    return NextResponse.json({ ok: false, error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

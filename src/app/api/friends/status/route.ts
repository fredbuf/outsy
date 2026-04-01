import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export type FriendshipStatus =
  | "none"              // no relationship
  | "pending_sent"      // current user sent a request, waiting
  | "pending_received"  // other user sent a request to current user
  | "friends";          // accepted

// GET /api/friends/status?userId=X
// Returns the friendship status between the authenticated user and userId X.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const targetId = searchParams.get("userId")?.trim();

  if (!targetId) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }
  if (targetId === user.id) {
    return NextResponse.json({ ok: true, status: "self" });
  }

  const { data: friendship } = await supabaseServer()
    .from("friendships")
    .select("id,requester_id,recipient_id,status")
    .or(
      `and(requester_id.eq.${user.id},recipient_id.eq.${targetId}),and(requester_id.eq.${targetId},recipient_id.eq.${user.id})`
    )
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json({ ok: true, status: "none" as FriendshipStatus });
  }

  if (friendship.status === "accepted") {
    return NextResponse.json({ ok: true, status: "friends" as FriendshipStatus, friendshipId: friendship.id });
  }

  // pending
  const status: FriendshipStatus =
    friendship.requester_id === user.id ? "pending_sent" : "pending_received";
  return NextResponse.json({ ok: true, status, friendshipId: friendship.id });
}

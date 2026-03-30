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

export type FriendProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

// GET /api/friends
// Returns the list of accepted friends for the authenticated user.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: friendships, error } = await supabase
    .from("friendships")
    .select("requester_id,recipient_id")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .eq("status", "accepted");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!friendships || friendships.length === 0) {
    return NextResponse.json({ ok: true, friends: [] });
  }

  const friendIds = friendships.map((f) =>
    f.requester_id === user.id ? f.recipient_id : f.requester_id
  );

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .in("id", friendIds)
    .order("display_name", { ascending: true, nullsFirst: false });

  return NextResponse.json({ ok: true, friends: (profiles ?? []) as FriendProfile[] });
}

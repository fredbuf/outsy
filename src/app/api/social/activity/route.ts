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

export type ActivityItemFriendRequest = {
  type: "friend_request";
  id: string;           // friendship row id
  from: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
  created_at: string;
};

export type ActivityItem = ActivityItemFriendRequest;

// GET /api/social/activity
// Returns activity items for the authenticated user, newest first.
// V1 scope: incoming pending friend requests only.
// Event invites / event updates require a dedicated notifications table (future).
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Incoming pending friend requests — rows where I am the recipient
  const { data: incoming, error } = await supabase
    .from("friendships")
    .select("id,requester_id,created_at,profiles!requester_id(id,display_name,username,avatar_url)")
    .eq("recipient_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const items: ActivityItem[] = (incoming ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const profile = p as { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null;
    return {
      type: "friend_request" as const,
      id: row.id,
      from: {
        id: profile?.id ?? row.requester_id,
        display_name: profile?.display_name ?? null,
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ ok: true, items });
}

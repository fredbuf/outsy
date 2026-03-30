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

// Friendship shape returned per result
export type FriendshipInfo = {
  id: string;
  status: "pending" | "accepted";
  direction: "sent" | "received"; // sent = caller is requester, received = caller is recipient
} | null;

export type UserSearchResult = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  friendship: FriendshipInfo;
};

// GET /api/users/search?q=...
// Requires: Authorization: Bearer <token>
// Returns up to 10 profiles whose display_name or username match the query.
// Attaches the caller's friendship status with each result.
// Only authenticated users can search — prevents unauthenticated profile crawling.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("q") ?? "";
  const q = raw.trim();

  // Require at least 2 characters — avoids full-table dumps and accidental discovery
  if (q.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const supabase = supabaseServer();
  const pattern = `%${q}%`;

  // Search profiles by display_name OR username (case-insensitive)
  // Exclude the caller — you cannot add yourself
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .or(`display_name.ilike.${pattern},username.ilike.${pattern}`)
    .neq("id", user.id)
    .limit(10);

  if (profilesError) {
    return NextResponse.json({ ok: false, error: profilesError.message }, { status: 500 });
  }

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ ok: true, results: [] });
  }

  // Fetch all friendships involving the caller (both directions)
  const { data: friendships } = await supabase
    .from("friendships")
    .select("id,requester_id,recipient_id,status")
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);

  const friendshipMap = new Map<string, FriendshipInfo>();
  for (const f of friendships ?? []) {
    // Determine which side is "other"
    const otherId =
      f.requester_id === user.id ? f.recipient_id : f.requester_id;
    const direction: "sent" | "received" =
      f.requester_id === user.id ? "sent" : "received";
    friendshipMap.set(otherId, {
      id: f.id,
      status: f.status as "pending" | "accepted",
      direction,
    });
  }

  const results: UserSearchResult[] = profiles.map((p) => ({
    id: p.id,
    display_name: p.display_name,
    username: p.username,
    avatar_url: p.avatar_url,
    friendship: friendshipMap.get(p.id) ?? null,
  }));

  return NextResponse.json({ ok: true, results });
}

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

export type ConversationPreview = {
  userId: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  lastMessage: {
    body: string;
    created_at: string;
    isFromMe: boolean;
    isUnread: boolean; // true when last message is incoming AND read_at IS NULL
  };
};

// GET /api/social/conversations
// Returns a list of conversations for the authenticated user, sorted by most recent message.
// A "conversation" is all messages between the caller and one other user.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Fetch recent messages involving current user
  const { data: msgs, error: msgsError } = await supabase
    .from("messages")
    .select("id,sender_id,recipient_id,body,created_at,read_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(200);

  if (msgsError) {
    return NextResponse.json({ ok: false, error: msgsError.message }, { status: 500 });
  }

  if (!msgs || msgs.length === 0) {
    return NextResponse.json({ ok: true, conversations: [] });
  }

  // Group by the "other" user — keep only the latest message per pair
  const latestByUser = new Map<string, typeof msgs[0]>();
  for (const msg of msgs) {
    const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
    if (!latestByUser.has(otherId)) {
      latestByUser.set(otherId, msg); // msgs are desc, so first = latest
    }
  }

  const otherIds = [...latestByUser.keys()];
  if (otherIds.length === 0) {
    return NextResponse.json({ ok: true, conversations: [] });
  }

  // Fetch profiles for all conversation partners
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .in("id", otherIds);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  const conversations: ConversationPreview[] = otherIds
    .map((otherId) => {
      const msg = latestByUser.get(otherId)!;
      const profile = profileMap.get(otherId);
      return {
        userId: otherId,
        display_name: profile?.display_name ?? null,
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
        lastMessage: {
          body: msg.body,
          created_at: msg.created_at,
          isFromMe: msg.sender_id === user.id,
          isUnread: msg.sender_id !== user.id && msg.read_at == null,
        },
      };
    })
    // Sort by most recent message desc
    .sort((a, b) =>
      b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
    );

  return NextResponse.json({ ok: true, conversations });
}

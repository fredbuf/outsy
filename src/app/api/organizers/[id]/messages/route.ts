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

export async function verifyMembership(
  supabase: ReturnType<typeof supabaseServer>,
  userId: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("organizer_members")
    .select("id")
    .eq("organizer_id", orgId)
    .eq("user_id", userId)
    .in("role", ["owner", "admin", "editor"])
    .eq("status", "active")
    .maybeSingle();
  return !!data;
}

export type MessageEventSummary = {
  id: string;
  title: string;
  image_url: string | null;
  start_at: string | null;
  venue_name: string | null;
};

export type OrgMessageRow = {
  id: string;
  sender_id: string;
  sender_organizer_id: string | null;
  sender_organizer: { name: string; slug: string | null; image_url: string | null } | null;
  body: string;
  event_id: string | null;
  event: MessageEventSummary | null;
  created_at: string;
  deleted_at: string | null;
};

export type OrgConversationPreview = {
  userId: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  lastMessage: {
    body: string;
    created_at: string;
    isFromOrg: boolean;
    isUnread: boolean;
  };
};

// GET /api/organizers/[id]/messages
// Organizer inbox — lists conversations grouped by user (requires membership).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const supabase = supabaseServer();
  const isMember = await verifyMembership(supabase, user.id, orgId);
  if (!isMember) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  // Fetch all messages to/from this organizer, newest first.
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("id,sender_id,sender_organizer_id,recipient_id,body,created_at,read_at,deleted_at")
    .or(`recipient_organizer_id.eq.${orgId},sender_organizer_id.eq.${orgId}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!msgs || msgs.length === 0) return NextResponse.json({ ok: true, conversations: [] });

  // Group by the "other" user: for incoming, it's sender_id; for outgoing, recipient_id.
  const latestByUser = new Map<string, typeof msgs[0]>();
  for (const msg of msgs) {
    const isFromOrg = (msg.sender_organizer_id as string | null) === orgId;
    const otherId = isFromOrg
      ? (msg.recipient_id as string | null)
      : (msg.sender_id as string);
    if (!otherId) continue;
    if (!latestByUser.has(otherId)) latestByUser.set(otherId, msg);
  }

  const userIds = [...latestByUser.keys()];
  if (userIds.length === 0) return NextResponse.json({ ok: true, conversations: [] });

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

  const conversations: OrgConversationPreview[] = userIds
    .map((uid) => {
      const msg = latestByUser.get(uid)!;
      const profile = profileMap.get(uid);
      const isFromOrg = (msg.sender_organizer_id as string | null) === orgId;
      return {
        userId: uid,
        display_name: profile?.display_name ?? null,
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
        lastMessage: {
          body: msg.body as string,
          created_at: msg.created_at as string,
          isFromOrg,
          isUnread: !isFromOrg && (msg.read_at as string | null) == null,
        },
      };
    })
    .sort((a, b) => b.lastMessage.created_at.localeCompare(a.lastMessage.created_at));

  return NextResponse.json({ ok: true, conversations });
}

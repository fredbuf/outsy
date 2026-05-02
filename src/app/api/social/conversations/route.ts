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
  // For user↔user: the other person's profile ID.
  // For user↔org: set to orgId (used as list key only; routing uses orgId).
  userId: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  // Only set when this is a user↔organizer conversation.
  orgId?: string;
  orgName?: string | null;
  orgImageUrl?: string | null;
  lastMessage: {
    body: string;
    created_at: string;
    isFromMe: boolean;
    isUnread: boolean; // true when last message is incoming AND read_at IS NULL
  };
};

// GET /api/social/conversations
// Returns conversations for the authenticated user:
//   1. User↔user: pure user-to-user messages (both organizer columns null).
//   2. User↔org: messages where the user messaged an organizer (as a fan/visitor).
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  // ── Query 1: user↔user messages ─────────────────────────────────────────────
  // Exclude any message involving an organizer on either side.
  const { data: u2uMsgs, error: u2uError } = await supabase
    .from("messages")
    .select("id,sender_id,recipient_id,body,created_at,read_at")
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .is("sender_organizer_id", null)
    .is("recipient_organizer_id", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (u2uError) {
    return NextResponse.json({ ok: false, error: u2uError.message }, { status: 500 });
  }

  // ── Query 2a: messages user sent TO an organizer ─────────────────────────────
  const { data: sentToOrg } = await supabase
    .from("messages")
    .select("id,sender_id,recipient_organizer_id,body,created_at,read_at")
    .eq("sender_id", user.id)
    .not("recipient_organizer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  // ── Query 2b: messages an organizer sent TO this user ───────────────────────
  const { data: receivedFromOrg } = await supabase
    .from("messages")
    .select("id,sender_organizer_id,recipient_id,body,created_at,read_at")
    .eq("recipient_id", user.id)
    .not("sender_organizer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  // ── Build user↔user conversation list ───────────────────────────────────────
  const latestByUser = new Map<string, typeof u2uMsgs extends null ? never : NonNullable<typeof u2uMsgs>[0]>();
  for (const msg of u2uMsgs ?? []) {
    const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
    if (otherId && !latestByUser.has(otherId)) {
      latestByUser.set(otherId, msg);
    }
  }

  // ── Build user↔org conversation list (grouped by org) ───────────────────────
  type OrgMsgCandidate = {
    id: string;
    orgId: string;
    body: string;
    created_at: string;
    isFromMe: boolean;
    read_at: string | null;
  };
  const latestByOrg = new Map<string, OrgMsgCandidate>();

  for (const msg of sentToOrg ?? []) {
    const orgId = msg.recipient_organizer_id as string;
    if (!latestByOrg.has(orgId)) {
      latestByOrg.set(orgId, {
        id: msg.id as string,
        orgId,
        body: msg.body as string,
        created_at: msg.created_at as string,
        isFromMe: true,
        read_at: msg.read_at as string | null,
      });
    }
  }
  for (const msg of receivedFromOrg ?? []) {
    const orgId = msg.sender_organizer_id as string;
    const existing = latestByOrg.get(orgId);
    const candidate: OrgMsgCandidate = {
      id: msg.id as string,
      orgId,
      body: msg.body as string,
      created_at: msg.created_at as string,
      isFromMe: false,
      read_at: msg.read_at as string | null,
    };
    if (!existing || candidate.created_at > existing.created_at) {
      latestByOrg.set(orgId, candidate);
    }
  }

  // ── Batch-fetch profiles for user↔user ──────────────────────────────────────
  const userIds = [...latestByUser.keys()];
  const profileMap = new Map<string, { id: string; display_name: string | null; username: string | null; avatar_url: string | null }>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", userIds);
    for (const p of profiles ?? []) profileMap.set(p.id as string, p as typeof profileMap extends Map<string, infer V> ? V : never);
  }

  // ── Batch-fetch organizer info for user↔org ──────────────────────────────────
  const orgIds = [...latestByOrg.keys()];
  const orgMap = new Map<string, { id: string; name: string; image_url: string | null }>();
  if (orgIds.length > 0) {
    const { data: orgs } = await supabase
      .from("organizers")
      .select("id,name,image_url")
      .in("id", orgIds);
    for (const o of orgs ?? []) orgMap.set(o.id as string, { id: o.id as string, name: o.name as string, image_url: (o.image_url as string | null) ?? null });
  }

  // ── Assemble user↔user conversations ────────────────────────────────────────
  const u2uConvs: ConversationPreview[] = userIds.map((otherId) => {
    const msg = latestByUser.get(otherId)!;
    const profile = profileMap.get(otherId);
    return {
      userId: otherId,
      display_name: profile?.display_name ?? null,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      lastMessage: {
        body: msg.body as string,
        created_at: msg.created_at as string,
        isFromMe: msg.sender_id === user.id,
        isUnread: msg.sender_id !== user.id && (msg.read_at as string | null) == null,
      },
    };
  });

  // ── Assemble user↔org conversations ─────────────────────────────────────────
  const orgConvs: ConversationPreview[] = orgIds.map((orgId) => {
    const msg = latestByOrg.get(orgId)!;
    const org = orgMap.get(orgId);
    return {
      userId: orgId, // used as list key only
      display_name: null,
      username: null,
      avatar_url: null,
      orgId,
      orgName: org?.name ?? null,
      orgImageUrl: org?.image_url ?? null,
      lastMessage: {
        body: msg.body,
        created_at: msg.created_at,
        isFromMe: msg.isFromMe,
        isUnread: !msg.isFromMe && msg.read_at == null,
      },
    };
  });

  // ── Merge and sort by most recent ────────────────────────────────────────────
  const conversations: ConversationPreview[] = [...u2uConvs, ...orgConvs].sort((a, b) =>
    b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
  );

  return NextResponse.json({ ok: true, conversations });
}

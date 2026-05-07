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

export type ActivityActor = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type ActivityEventSummary = {
  id: string;
  title: string;
  image_url: string | null;
};

export type MomentMeta = {
  event_id: string;
  event_title: string;
};

export type ActivityItem = {
  id: string;
  type:
    | "friend_request_received"
    | "friend_request_accepted"
    | "event_invite"
    | "moment_posted"
    | "moment_comment"
    | "rsvp_received"
    | "cohost_invite"
    | "organizer_new_follower"
    | "organizer_new_message"
    | "organizer_new_rsvp"
    | "organizer_member_invite";
  actor: ActivityActor;
  entity_id: string | null;
  // friend_request_received: true while friendship is still pending
  friendshipPending: boolean;
  // event_invite / cohost_invite / rsvp_received / organizer_new_rsvp: event details
  event: ActivityEventSummary | null;
  // moment_posted / moment_comment: event context from notification metadata
  momentMeta: MomentMeta | null;
  // cohost_invite: pending / accepted / declined
  cohostInviteStatus: "pending" | "accepted" | "declined" | null;
  // rsvp_received / organizer_new_rsvp: the RSVP response value
  rsvpResponse: string | null;
  // organizer_new_message: first 120 chars of the message body
  messagePreview: string | null;
  // organizer_member_invite: pending / accepted / declined + invite context
  orgMemberInvite: {
    status: "pending" | "accepted" | "declined";
    organizerName: string;
    organizerSlug: string | null;
    role: string;
  } | null;
  read: boolean;
  created_at: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyMembership(
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

// GET /api/social/activity
// Personal mode (no ?orgId): notifications for the authenticated user where organizer_id IS NULL.
// Organizer mode (?orgId=<uuid>): notifications for that organizer; requires active membership.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get("orgId");

  const supabase = supabaseServer();

  let notifsQuery;

  if (orgId) {
    if (!UUID_RE.test(orgId))
      return NextResponse.json({ ok: false, error: "Invalid orgId." }, { status: 400 });

    const isMember = await verifyMembership(supabase, user.id, orgId);
    if (!isMember)
      return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

    notifsQuery = supabase
      .from("notifications")
      .select("id,type,actor_id,entity_id,metadata,read,created_at")
      .eq("organizer_id", orgId)
      .order("created_at", { ascending: false })
      .limit(50);
  } else {
    notifsQuery = supabase
      .from("notifications")
      .select("id,type,actor_id,entity_id,metadata,read,created_at")
      .eq("user_id", user.id)
      .is("organizer_id", null)
      .order("created_at", { ascending: false })
      .limit(50);
  }

  let { data: notifs, error } = await notifsQuery;

  // If the organizer_id column doesn't exist yet (migration not applied),
  // fall back to a plain user_id-only query so personal activity still works.
  if (error && !orgId && error.message.includes("organizer_id")) {
    const fallback = await supabase
      .from("notifications")
      .select("id,type,actor_id,entity_id,metadata,read,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    notifs = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!notifs || notifs.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // ── Batch fetch actor profiles ─────────────────────────────────────────────
  const actorIds = [
    ...new Set(
      notifs.map((n) => n.actor_id as string | null).filter((id): id is string => id != null)
    ),
  ];
  const profilesMap = new Map<string, ActivityActor>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      profilesMap.set(p.id as string, {
        id: p.id as string,
        display_name: p.display_name as string | null,
        username: p.username as string | null,
        avatar_url: p.avatar_url as string | null,
      });
    }
  }

  // ── Batch check which friend_request_received are still pending ────────────
  const receivedEntityIds = notifs
    .filter((n) => n.type === "friend_request_received" && n.entity_id)
    .map((n) => n.entity_id as string);
  const pendingSet = new Set<string>();
  if (receivedEntityIds.length > 0) {
    const { data: friendships } = await supabase
      .from("friendships")
      .select("id,status")
      .in("id", receivedEntityIds);
    for (const f of friendships ?? []) {
      if ((f.status as string) === "pending") pendingSet.add(f.id as string);
    }
  }

  // ── Batch check live membership status for organizer_member_invite ────────────
  // entity_id is the organizer_id for these notifications.
  // Status is derived from the live organizer_members row (not stored in metadata),
  // so accept/decline is always reflected correctly:
  //   pending row  → "pending"
  //   active row   → "accepted"
  //   no row       → "declined"
  const orgInviteOrgIds = [
    ...new Set(
      notifs
        .filter((n) => n.type === "organizer_member_invite" && n.entity_id)
        .map((n) => n.entity_id as string)
    ),
  ];
  const orgMemberStatusMap = new Map<string, "pending" | "accepted" | "declined">();
  if (orgInviteOrgIds.length > 0) {
    const { data: memberships } = await supabase
      .from("organizer_members")
      .select("organizer_id,status")
      .eq("user_id", user.id)
      .in("organizer_id", orgInviteOrgIds);
    for (const m of memberships ?? []) {
      const s = m.status as string;
      orgMemberStatusMap.set(
        m.organizer_id as string,
        s === "active" ? "accepted" : s === "pending" ? "pending" : "declined",
      );
    }
    // Organizer IDs with no membership row were declined.
  }

  // ── Batch fetch event details for event_invite, cohost_invite, rsvp_received, organizer_new_rsvp ─
  const eventIds = [
    ...new Set(
      notifs
        .filter((n) =>
          (n.type === "event_invite" ||
            n.type === "cohost_invite" ||
            n.type === "rsvp_received" ||
            n.type === "organizer_new_rsvp") &&
          n.entity_id
        )
        .map((n) => n.entity_id as string)
    ),
  ];
  const eventsMap = new Map<string, ActivityEventSummary>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id,title,image_url")
      .in("id", eventIds);
    for (const e of events ?? []) {
      eventsMap.set(e.id as string, {
        id: e.id as string,
        title: e.title as string,
        image_url: (e.image_url as string | null) ?? null,
      });
    }
  }

  // ── Assemble items ─────────────────────────────────────────────────────────
  const items: ActivityItem[] = notifs.map((n) => {
    const actorId = n.actor_id as string | null;
    const actor: ActivityActor = (actorId ? profilesMap.get(actorId) : undefined) ?? {
      id: actorId ?? "",
      display_name: null,
      username: null,
      avatar_url: null,
    };
    const entityId = n.entity_id as string | null;
    const metadata = (n.metadata ?? {}) as Record<string, unknown>;

    // moment_posted / moment_comment: event context lives in notification metadata
    const momentMeta: MomentMeta | null =
      (n.type === "moment_posted" || n.type === "moment_comment") &&
      typeof metadata.event_id === "string" &&
      typeof metadata.event_title === "string"
        ? { event_id: metadata.event_id, event_title: metadata.event_title }
        : null;

    const cohostInviteStatus: ActivityItem["cohostInviteStatus"] =
      n.type === "cohost_invite"
        ? ((metadata.status as string) === "accepted"
            ? "accepted"
            : (metadata.status as string) === "declined"
            ? "declined"
            : "pending")
        : null;

    const rsvpResponse: string | null =
      (n.type === "rsvp_received" || n.type === "organizer_new_rsvp") &&
      typeof metadata.rsvp_response === "string"
        ? metadata.rsvp_response
        : null;

    const messagePreview: string | null =
      n.type === "organizer_new_message" && typeof metadata.preview === "string"
        ? metadata.preview
        : null;

    const orgMemberInvite: ActivityItem["orgMemberInvite"] =
      n.type === "organizer_member_invite" && entityId != null
        ? {
            status: orgMemberStatusMap.get(entityId) ?? "declined",
            organizerName: typeof metadata.organizerName === "string" ? metadata.organizerName : "",
            organizerSlug: typeof metadata.organizerSlug === "string" ? metadata.organizerSlug : null,
            role: typeof metadata.role === "string" ? metadata.role : "admin",
          }
        : null;

    return {
      id: n.id as string,
      type: n.type as ActivityItem["type"],
      actor,
      entity_id: entityId,
      friendshipPending:
        n.type === "friend_request_received" && entityId != null
          ? pendingSet.has(entityId)
          : false,
      event:
        (n.type === "event_invite" ||
          n.type === "cohost_invite" ||
          n.type === "rsvp_received" ||
          n.type === "organizer_new_rsvp") && entityId != null
          ? (eventsMap.get(entityId) ?? null)
          : null,
      momentMeta,
      cohostInviteStatus,
      rsvpResponse,
      messagePreview,
      orgMemberInvite,
      read: n.read as boolean,
      created_at: n.created_at as string,
    };
  });

  return NextResponse.json({ ok: true, items });
}

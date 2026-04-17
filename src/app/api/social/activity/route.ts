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
  type: "friend_request_received" | "friend_request_accepted" | "event_invite" | "moment_posted" | "moment_comment" | "rsvp_received" | "cohost_invite";
  actor: ActivityActor;
  entity_id: string | null;
  // friend_request_received: true while friendship is still pending
  friendshipPending: boolean;
  // event_invite / cohost_invite / rsvp_received: event details
  event: ActivityEventSummary | null;
  // moment_posted / moment_comment: event context from notification metadata
  momentMeta: MomentMeta | null;
  // cohost_invite: pending / accepted / declined
  cohostInviteStatus: "pending" | "accepted" | "declined" | null;
  // rsvp_received: the RSVP response value
  rsvpResponse: string | null;
  read: boolean;
  created_at: string;
};

// GET /api/social/activity
// Returns notifications for the authenticated user, newest first.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: notifs, error } = await supabase
    .from("notifications")
    .select("id,type,actor_id,entity_id,metadata,read,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

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

  // ── Batch fetch event details for event_invite, cohost_invite, rsvp_received ─
  const eventIds = [
    ...new Set(
      notifs
        .filter((n) => (n.type === "event_invite" || n.type === "cohost_invite" || n.type === "rsvp_received") && n.entity_id)
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
      n.type === "rsvp_received" && typeof metadata.rsvp_response === "string"
        ? metadata.rsvp_response
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
        (n.type === "event_invite" || n.type === "cohost_invite" || n.type === "rsvp_received") && entityId != null
          ? (eventsMap.get(entityId) ?? null)
          : null,
      momentMeta,
      cohostInviteStatus,
      rsvpResponse,
      read: n.read as boolean,
      created_at: n.created_at as string,
    };
  });

  return NextResponse.json({ ok: true, items });
}

import "server-only";
import { supabaseServer } from "./supabase-server";

export type NotificationType =
  | "friend_request_received"
  | "friend_request_accepted"
  | "event_invite"
  | "moment_posted"
  | "moment_comment"
  | "rsvp_received"
  | "cohost_invite"
  | "organizer_member_invite";

export type OrgNotificationType =
  | "organizer_new_follower"
  | "organizer_new_message"
  | "organizer_new_rsvp";

export async function createNotification({
  userId,
  type,
  actorId,
  entityId,
  metadata = {},
}: {
  userId: string;
  type: NotificationType;
  actorId: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = supabaseServer();
  await supabase.from("notifications").insert({
    user_id: userId,
    type,
    actor_id: actorId,
    entity_id: entityId ?? null,
    metadata,
  });
}

// Creates a notification owned by an organizer (organizer_id set, user_id = actor).
// These are visible to org members via GET /api/social/activity?orgId=<id>,
// never in personal activity feeds.
export async function createOrgNotification({
  organizerId,
  actorId,
  type,
  entityId,
  metadata = {},
}: {
  organizerId: string;
  actorId: string;
  type: OrgNotificationType;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const supabase = supabaseServer();
  await supabase.from("notifications").insert({
    organizer_id: organizerId,
    user_id: actorId,
    actor_id: actorId,
    type,
    entity_id: entityId ?? null,
    metadata,
  });
}

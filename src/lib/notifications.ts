import "server-only";
import { supabaseServer } from "./supabase-server";

export type NotificationType =
  | "friend_request_received"
  | "friend_request_accepted"
  | "event_invite"
  | "moment_posted"
  | "moment_comment"
  | "rsvp_received"
  | "cohost_invite";

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

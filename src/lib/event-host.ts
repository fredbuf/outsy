import "server-only";
import { supabaseServer } from "./supabase-server";

type SupabaseClient = ReturnType<typeof supabaseServer>;

/**
 * Returns true if userId has host-level access to the event.
 *
 * Org-owned event (has event_organizers rows):
 *   The user must hold an active owner/admin/editor membership in any linked
 *   organizer, OR be listed in cohost_ids (personal co-host still applies).
 *
 * Personal event (no event_organizers rows):
 *   The user must be the creator or a cohost.
 */
export async function isEventHost(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  { creatorId, cohostIds }: { creatorId: string | null; cohostIds: string[] },
): Promise<boolean> {
  const { data: orgLinks } = await supabase
    .from("event_organizers")
    .select("organizer_id")
    .eq("event_id", eventId);

  const orgIds = (orgLinks ?? []).map((r) => r.organizer_id as string);

  if (orgIds.length > 0) {
    const { data: membership } = await supabase
      .from("organizer_members")
      .select("id")
      .in("organizer_id", orgIds)
      .eq("user_id", userId)
      .in("role", ["owner", "admin", "editor"])
      .eq("status", "active")
      .maybeSingle();
    return !!membership || cohostIds.includes(userId);
  }

  return creatorId === userId || cohostIds.includes(userId);
}

/**
 * Returns true if userId may manage (edit/delete) this event.
 * Stricter than isEventHost: personal cohosts cannot manage, only the event owner.
 *
 * Org-owned event: user must hold owner/admin/editor membership in any linked org.
 * Personal event:  user must be the creator.
 */
export async function canManageEvent(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  creatorId: string | null,
): Promise<boolean> {
  const { data: orgLinks } = await supabase
    .from("event_organizers")
    .select("organizer_id")
    .eq("event_id", eventId);

  const orgIds = (orgLinks ?? []).map((r) => r.organizer_id as string);

  if (orgIds.length > 0) {
    const { data: membership } = await supabase
      .from("organizer_members")
      .select("id")
      .in("organizer_id", orgIds)
      .eq("user_id", userId)
      .in("role", ["owner", "admin", "editor"])
      .eq("status", "active")
      .maybeSingle();
    return !!membership;
  }

  return creatorId === userId;
}

/**
 * Returns the organizer IDs linked to an event via event_organizers.
 * Empty array means the event is personally owned.
 */
export async function fetchEventOrganizerIds(
  supabase: SupabaseClient,
  eventId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("event_organizers")
    .select("organizer_id")
    .eq("event_id", eventId);
  return (data ?? []).map((r) => r.organizer_id as string);
}

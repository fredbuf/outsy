/**
 * Client-safe event ownership helpers.
 *
 * Ownership model:
 *   Org-owned event (eventOrganizerIds.length > 0):
 *     The active organizer profile must match one of the organizer IDs.
 *     The personal profile never gets owner access, even if the same auth user
 *     manages the org — activeOrganizerId must explicitly be set to that org.
 *
 *   Personal event (eventOrganizerIds.length === 0):
 *     The personal profile (userId === creatorId) is the owner.
 */

/**
 * Returns true if the currently active profile is the event owner.
 * Use for edit / delete / manage controls.
 */
export function isEventOwner({
  userId,
  activeOrganizerId,
  creatorId,
  eventOrganizerIds,
}: {
  userId: string | null;
  activeOrganizerId: string | null;
  creatorId: string | null;
  eventOrganizerIds: string[];
}): boolean {
  if (!userId) return false;
  if (eventOrganizerIds.length > 0) {
    return activeOrganizerId !== null && eventOrganizerIds.includes(activeOrganizerId);
  }
  return userId === creatorId;
}

/**
 * Returns true if the current user has host-or-cohost access.
 * Includes personal cohosts (cohost_ids) regardless of active profile.
 * Use for moments moderation, pinning, and host-view UI.
 */
export function isEventHostOrCohost({
  userId,
  activeOrganizerId,
  creatorId,
  eventOrganizerIds,
  cohostIds,
}: {
  userId: string | null;
  activeOrganizerId: string | null;
  creatorId: string | null;
  eventOrganizerIds: string[];
  cohostIds: string[];
}): boolean {
  if (!userId) return false;
  if (cohostIds.includes(userId)) return true;
  return isEventOwner({ userId, activeOrganizerId, creatorId, eventOrganizerIds });
}

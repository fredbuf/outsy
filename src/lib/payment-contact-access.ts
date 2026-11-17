// Who may see a private event's payment contact (e.g. the Interac e-transfer
// address). Pure decision logic — no I/O — so it can be unit-tested and shared.
//
// The contact is personal information belonging to the host. It must never be
// serialized into a page payload; it is only returned by
// GET /api/events/[id]/payment-contact, which applies this rule.

/** Notification types that count as "this user was invited to the event". */
export const EVENT_INVITE_NOTIFICATION_TYPES = ["event_invite", "cohost_invite"] as const;

/** RSVP responses that count as "this user has RSVP'd" for payment purposes. */
export const PAYMENT_CONTACT_RSVP_RESPONSES = ["going", "maybe"] as const;

export type PaymentContactViewer = {
  /** Authenticated user id, or null when the request carries no valid session. */
  userId: string | null;
  /** Creator, cohost, or manager of an organizer that owns the event. */
  isHost: boolean;
  /** The viewer's RSVP response for this event, or null if they have none. */
  rsvpResponse: string | null;
  /** The viewer was sent an invitation (guest or cohost) to this event. */
  hasInvite: boolean;
};

export function canViewPaymentContact(viewer: PaymentContactViewer): boolean {
  if (!viewer.userId) return false;
  if (viewer.isHost) return true;
  if (viewer.hasInvite) return true;
  return (
    viewer.rsvpResponse !== null &&
    (PAYMENT_CONTACT_RSVP_RESPONSES as readonly string[]).includes(viewer.rsvpResponse)
  );
}

/**
 * PATCH /api/events/[id] helper: decide what to write to events.payment_contact.
 *
 * Returns `{ write: false }` when the stored value must be left untouched —
 * the edit form omits `paymentContact` if it never managed to load the current
 * value, and an omitted field must not erase it.
 */
export function resolvePaymentContactUpdate(
  body: Record<string, unknown>,
  paymentMethod: string | null,
): { write: true; value: string | null } | { write: false } {
  if (!paymentMethod) return { write: true, value: null };
  if (!("paymentContact" in body)) return { write: false };
  const raw = body.paymentContact;
  return {
    write: true,
    value: typeof raw === "string" ? raw.trim().slice(0, 200) || null : null,
  };
}

import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isEventHost } from "@/lib/event-host";
import {
  canViewPaymentContact,
  EVENT_INVITE_NOTIFICATION_TYPES,
} from "@/lib/payment-contact-access";

// Personal data — never cache.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "no-store" };

async function resolveAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/events/[id]/payment-contact
// Returns the event's payment contact to hosts, cohosts, invited users and
// users who have RSVP'd (going / maybe). Everyone else gets 401 or 403.
// This is the only place the payment contact leaves the server.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  if (!UUID_RE.test(eventId)) {
    return NextResponse.json({ ok: false, error: "Invalid event id." }, { status: 400, headers: NO_STORE });
  }

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to view payment details." }, { status: 401, headers: NO_STORE });
  }

  const supabase = supabaseServer();
  const { data: event } = await supabase
    .from("events")
    .select("id,creator_id,cohost_ids,payment_method,payment_contact")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404, headers: NO_STORE });
  }

  const creatorId = (event.creator_id as string | null) ?? null;
  const cohostIds = Array.isArray(event.cohost_ids) ? (event.cohost_ids as string[]) : [];

  const [isHost, { data: rsvp }, { data: invites }] = await Promise.all([
    isEventHost(supabase, eventId, user.id, { creatorId, cohostIds }),
    supabase
      .from("rsvps")
      .select("response")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("notifications")
      .select("id")
      .eq("user_id", user.id)
      .eq("entity_id", eventId)
      .in("type", [...EVENT_INVITE_NOTIFICATION_TYPES])
      .limit(1),
  ]);

  const allowed = canViewPaymentContact({
    userId: user.id,
    isHost,
    rsvpResponse: (rsvp?.response as string | undefined) ?? null,
    hasInvite: (invites ?? []).length > 0,
  });

  if (!allowed) {
    return NextResponse.json(
      { ok: false, error: "RSVP to view payment details." },
      { status: 403, headers: NO_STORE }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      paymentMethod: (event.payment_method as string | null) ?? null,
      paymentContact: (event.payment_contact as string | null) ?? null,
    },
    { headers: NO_STORE }
  );
}

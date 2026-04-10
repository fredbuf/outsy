import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteParams = { params: Promise<{ id: string }> };

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

// POST /api/events/[id]/cohost-invite
// Body: { notificationId: string, action: "accept" | "decline" }
// Invitee accepts or declines a cohost invitation.
// On accept: appends the user to events.cohost_ids and updates notification metadata.
// On decline: updates notification metadata to declined.
export async function POST(
  req: Request,
  { params }: RouteParams
) {
  const { id: eventId } = await params;

  if (!UUID_RE.test(eventId)) {
    return NextResponse.json({ ok: false, error: "Invalid event id." }, { status: 400 });
  }

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const notificationId = typeof body.notificationId === "string" ? body.notificationId.trim() : null;
  const action = body.action === "accept" || body.action === "decline" ? body.action : null;

  if (!notificationId || !UUID_RE.test(notificationId)) {
    return NextResponse.json({ ok: false, error: "notificationId is required." }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ ok: false, error: "action must be 'accept' or 'decline'." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify the notification belongs to the caller and is a pending cohost_invite for this event
  const { data: notif, error: notifError } = await supabase
    .from("notifications")
    .select("id,user_id,entity_id,metadata")
    .eq("id", notificationId)
    .eq("user_id", user.id)
    .eq("type", "cohost_invite")
    .eq("entity_id", eventId)
    .maybeSingle();

  if (notifError) {
    console.error("[cohost-invite] notification lookup error:", notifError.message);
    return NextResponse.json({ ok: false, error: "Failed to look up invitation." }, { status: 500 });
  }
  if (!notif) {
    return NextResponse.json({ ok: false, error: "Invitation not found." }, { status: 404 });
  }

  const metadata = (notif.metadata ?? {}) as Record<string, unknown>;
  if (metadata.status === "accepted" || metadata.status === "declined") {
    return NextResponse.json({ ok: false, error: "Invitation already responded to." }, { status: 409 });
  }

  // Update notification metadata with the response
  const { error: updateNotifError } = await supabase
    .from("notifications")
    .update({ metadata: { ...metadata, status: action === "accept" ? "accepted" : "declined" }, read: true })
    .eq("id", notificationId)
    .eq("user_id", user.id);

  if (updateNotifError) {
    console.error("[cohost-invite] notification update error:", updateNotifError.message);
    return NextResponse.json({ ok: false, error: "Failed to update invitation." }, { status: 500 });
  }

  if (action === "accept") {
    // Fetch current cohost_ids, append the user, then update
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id,cohost_ids")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !event) {
      return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
    }

    const existing = Array.isArray(event.cohost_ids) ? (event.cohost_ids as string[]) : [];
    if (!existing.includes(user.id)) {
      const { error: patchError } = await supabase
        .from("events")
        .update({ cohost_ids: [...existing, user.id] })
        .eq("id", eventId);

      if (patchError) {
        console.error("[cohost-invite] cohost_ids patch error:", patchError.message);
        return NextResponse.json({ ok: false, error: "Failed to add co-host." }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

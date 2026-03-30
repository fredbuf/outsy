import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST /api/events/[id]/invite
// Body: { userId: string }
// Requires: Authorization: Bearer <token>
//
// Sends an event_invite notification to a user.
// Only the event creator can invite. Event must be private.
// Idempotent: silently succeeds if the user was already invited.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id: eventId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { userId: inviteeId } = body as Record<string, unknown>;
  if (typeof inviteeId !== "string" || !inviteeId.trim()) {
    return NextResponse.json({ ok: false, error: "userId is required." }, { status: 400 });
  }

  if (inviteeId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot invite yourself." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify event exists, is private, and caller is the creator
  const { data: event } = await supabase
    .from("events")
    .select("id,creator_id,visibility,title")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  if (event.creator_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  if (event.visibility !== "private") {
    return NextResponse.json({ ok: false, error: "Only private events can be invited to." }, { status: 400 });
  }

  // Verify invitee exists
  const { data: invitee } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", inviteeId)
    .maybeSingle();
  if (!invitee) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  // Idempotency: skip if already invited (notification already exists)
  const { data: existing } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", inviteeId)
    .eq("type", "event_invite")
    .eq("entity_id", eventId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, alreadyInvited: true });
  }

  await createNotification({
    userId: inviteeId,
    type: "event_invite",
    actorId: user.id,
    entityId: eventId,
  });

  return NextResponse.json({ ok: true });
}

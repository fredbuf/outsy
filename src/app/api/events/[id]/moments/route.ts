import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const BODY_MAX = 1000;

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

// GET /api/events/[id]/moments — public read, no auth required
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const supabase = supabaseServer();

  const { data, error } = await supabase
    .from("moments")
    .select(
      "id,event_id,author_id,body,is_pinned,reactions_enabled,created_at," +
        "profiles(display_name,avatar_url,username)," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, moments: data ?? [] });
}

// POST /api/events/[id]/moments — create a moment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Fetch event and permission fields
  const { data: event } = await supabase
    .from("events")
    .select("id,title,creator_id,cohost_ids,is_approved,is_rejected")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  if (!event.is_approved || event.is_rejected) {
    return NextResponse.json({ ok: false, error: "Event not available." }, { status: 403 });
  }

  const creatorId = event.creator_id as string | null;
  const cohostIds = Array.isArray(event.cohost_ids)
    ? (event.cohost_ids as string[])
    : [];
  const isHost = creatorId === user.id;
  const isCohost = cohostIds.includes(user.id);

  // Read moments_guests_can_post (new column — defaults false if absent)
  const guestsCanPost = Boolean(
    (event as Record<string, unknown>).moments_guests_can_post ?? false
  );

  if (!isHost && !isCohost && !guestsCanPost) {
    return NextResponse.json(
      { ok: false, error: "Posting is not enabled for this event." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const text = String(body.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Moment text is required." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Text must be ${BODY_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const reactionsEnabled = body.reactions_enabled !== false;
  const isPinned = (isHost || isCohost) && body.is_pinned === true;

  // Unpin any existing pinned moment before pinning the new one
  if (isPinned) {
    await supabase
      .from("moments")
      .update({ is_pinned: false })
      .eq("event_id", eventId)
      .eq("is_pinned", true);
  }

  const { data: newMoment, error: insertError } = await supabase
    .from("moments")
    .insert({
      event_id: eventId,
      author_id: user.id,
      body: text,
      is_pinned: isPinned,
      reactions_enabled: reactionsEnabled,
    })
    .select("id,event_id,author_id,body,is_pinned,reactions_enabled,created_at")
    .single();

  if (insertError || !newMoment) {
    return NextResponse.json(
      { ok: false, error: "Failed to create moment." },
      { status: 500 }
    );
  }

  // Notify all "going" RSVPs (fire-and-forget; non-critical)
  try {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("response", "going");

    const recipientIds = (rsvps ?? [])
      .map((r) => r.user_id as string)
      .filter((uid) => uid !== user.id);

    if (recipientIds.length > 0) {
      const eventTitle = event.title as string;
      const notifications = recipientIds.map((uid) => ({
        user_id: uid,
        type: "moment_posted",
        actor_id: user.id,
        entity_id: (newMoment as { id: string }).id,
        metadata: { event_id: eventId, event_title: eventTitle },
      }));
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Non-critical: ignore errors
  }

  return NextResponse.json({ ok: true, moment: newMoment });
}

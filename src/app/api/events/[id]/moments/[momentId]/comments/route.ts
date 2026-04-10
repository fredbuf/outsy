import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const BODY_MAX = 1000;

type RouteParams = { params: Promise<{ id: string; momentId: string }> };

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

// GET /api/events/[id]/moments/[momentId]/comments
// Returns chronological comments for a moment. No auth required.
export async function GET(
  _req: Request,
  { params }: RouteParams
) {
  const { momentId } = await params;
  const supabase = supabaseServer();

  // Check that comments are enabled for this moment
  const { data: moment } = await supabase
    .from("moments")
    .select("id,comments_enabled")
    .eq("id", momentId)
    .maybeSingle();

  if (!moment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }
  if (moment.comments_enabled === false) {
    return NextResponse.json({ ok: true, comments: [] });
  }

  const { data: rows, error } = await supabase
    .from("comments")
    .select("id,moment_id,user_id,body,created_at")
    .eq("moment_id", momentId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const comments = (rows ?? []) as Array<Record<string, unknown>>;

  // Batch-fetch author profiles
  const userIds = [...new Set(comments.map((r) => r.user_id as string))];
  const profilesMap = new Map<
    string,
    { display_name: string | null; avatar_url: string | null; username: string | null }
  >();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,username")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profilesMap.set(p.id as string, {
        display_name: p.display_name as string | null,
        avatar_url: p.avatar_url as string | null,
        username: p.username as string | null,
      });
    }
  }

  const result = comments.map((row) => ({
    ...row,
    author: profilesMap.get(row.user_id as string) ?? null,
  }));

  return NextResponse.json({ ok: true, comments: result });
}

// POST /api/events/[id]/moments/[momentId]/comments
// Creates a comment. Auth required.
// For private events, user must be creator, cohost, or have an RSVP.
export async function POST(
  req: Request,
  { params }: RouteParams
) {
  const { id: eventId, momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Verify moment exists and comments are enabled
  const { data: moment } = await supabase
    .from("moments")
    .select("id,event_id,comments_enabled")
    .eq("id", momentId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!moment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }
  if (moment.comments_enabled === false) {
    return NextResponse.json({ ok: false, error: "Comments are disabled for this moment." }, { status: 403 });
  }

  // Verify event is available
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,creator_id,cohost_ids,is_approved,is_rejected,visibility")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[POST comments] event lookup error:", eventError.message);
    return NextResponse.json({ ok: false, error: "Failed to look up event." }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const isPrivate = (event as Record<string, unknown>).visibility === "private";

  // Private events are self-approved by the host; public events need to pass moderation.
  if (!isPrivate && (!event.is_approved || event.is_rejected)) {
    return NextResponse.json({ ok: false, error: "Event not available." }, { status: 403 });
  }

  const creatorId = event.creator_id as string | null;
  const cohostIds = Array.isArray(event.cohost_ids) ? (event.cohost_ids as string[]) : [];
  const isHostOrCohost = creatorId === user.id || cohostIds.includes(user.id);

  // For private events, require host/cohost or RSVP
  if (isPrivate && !isHostOrCohost) {
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id")
      .eq("event_id", eventId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!rsvp) {
      return NextResponse.json({ ok: false, error: "Not authorized to comment on this event." }, { status: 403 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const text = String(body.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Comment text is required." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Comment must be ${BODY_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const { data: newComment, error: insertError } = await supabase
    .from("comments")
    .insert({ moment_id: momentId, user_id: user.id, body: text })
    .select("id,moment_id,user_id,body,created_at")
    .single();

  if (insertError || !newComment) {
    return NextResponse.json({ ok: false, error: "Failed to create comment." }, { status: 500 });
  }

  // Fetch author profile for the response
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,avatar_url,username")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    comment: {
      ...newComment,
      author: profile ?? null,
    },
  });
}

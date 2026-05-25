import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { isEventHost } from "@/lib/event-host";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; momentId: string; commentId: string }> };

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

// DELETE /api/events/[id]/moments/[momentId]/comments/[commentId]
// Allowed by: comment author, event host, any cohost.
export async function DELETE(
  req: Request,
  { params }: RouteParams
) {
  const { id: eventId, momentId, commentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Fetch the comment — verify it belongs to this moment
  const { data: comment } = await supabase
    .from("comments")
    .select("id,user_id,moment_id")
    .eq("id", commentId)
    .eq("moment_id", momentId)
    .maybeSingle();

  if (!comment) {
    return NextResponse.json({ ok: false, error: "Comment not found." }, { status: 404 });
  }

  // Comment author can always delete their own comment
  if (comment.user_id === user.id) {
    const { error: delError } = await supabase
      .from("comments")
      .delete()
      .eq("id", commentId);

    if (delError) {
      console.error("[DELETE comment] delete failed:", delError.message);
      return NextResponse.json({ ok: false, error: "Failed to delete comment." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Otherwise check if the user is the event host or a cohost
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id,creator_id,cohost_ids,visibility")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    console.error("[DELETE comment] event lookup error:", eventError.message);
    return NextResponse.json({ ok: false, error: "Failed to look up event." }, { status: 500 });
  }
  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  const creatorId = event.creator_id as string | null;
  const cohostIds = Array.isArray(event.cohost_ids) ? (event.cohost_ids as string[]) : [];
  const hostAccess = await isEventHost(supabase, eventId, user.id, { creatorId, cohostIds });

  if (!hostAccess) {
    return NextResponse.json({ ok: false, error: "Not authorized to delete this comment." }, { status: 403 });
  }

  // Verify the moment belongs to this event (prevents cross-event manipulation)
  const { data: moment } = await supabase
    .from("moments")
    .select("id")
    .eq("id", momentId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!moment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }

  const { error: delError } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (delError) {
    console.error("[DELETE comment] delete failed:", delError.message);
    return NextResponse.json({ ok: false, error: "Failed to delete comment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

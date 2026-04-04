import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

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

type RouteParams = { params: Promise<{ id: string; momentId: string }> };

// DELETE /api/events/[id]/moments/[momentId]
// Author or event host/cohost can delete a moment.
export async function DELETE(req: Request, { params }: RouteParams) {
  const { id: eventId, momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: moment } = await supabase
    .from("moments")
    .select("id,author_id,event_id")
    .eq("id", momentId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!moment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }

  // Check if user is author
  if ((moment.author_id as string) === user.id) {
    const { error } = await supabase.from("moments").delete().eq("id", momentId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // Check if user is event host or cohost
  const { data: event } = await supabase
    .from("events")
    .select("creator_id,cohost_ids")
    .eq("id", eventId)
    .maybeSingle();

  const creatorId = event?.creator_id as string | null;
  const cohostIds = Array.isArray(event?.cohost_ids)
    ? (event.cohost_ids as string[])
    : [];

  if (creatorId !== user.id && !cohostIds.includes(user.id)) {
    return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
  }

  const { error } = await supabase.from("moments").delete().eq("id", momentId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// PATCH /api/events/[id]/moments/[momentId]
// Pin or unpin a moment. Host/cohost only.
// Body: { is_pinned: boolean }
export async function PATCH(req: Request, { params }: RouteParams) {
  const { id: eventId, momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Verify host/cohost
  const { data: event } = await supabase
    .from("events")
    .select("creator_id,cohost_ids")
    .eq("id", eventId)
    .maybeSingle();

  const creatorId = event?.creator_id as string | null;
  const cohostIds = Array.isArray(event?.cohost_ids)
    ? (event.cohost_ids as string[])
    : [];

  if (creatorId !== user.id && !cohostIds.includes(user.id)) {
    return NextResponse.json({ ok: false, error: "Only the host can pin moments." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const isPinned = Boolean(body.is_pinned);

  // If pinning, unpin all others first
  if (isPinned) {
    await supabase
      .from("moments")
      .update({ is_pinned: false })
      .eq("event_id", eventId)
      .eq("is_pinned", true)
      .neq("id", momentId);
  }

  const { error } = await supabase
    .from("moments")
    .update({ is_pinned: isPinned })
    .eq("id", momentId)
    .eq("event_id", eventId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

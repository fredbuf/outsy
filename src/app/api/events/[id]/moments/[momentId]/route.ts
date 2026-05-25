import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchLinkPreview } from "@/lib/fetch-link-preview";
import { isEventHost } from "@/lib/event-host";

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

  const hostAccess = await isEventHost(supabase, eventId, user.id, { creatorId, cohostIds });
  if (!hostAccess) {
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

  const hostAccess = await isEventHost(supabase, eventId, user.id, { creatorId, cohostIds });
  if (!hostAccess) {
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

// PUT /api/events/[id]/moments/[momentId]
// Edit a moment's body, link, image, reactions_enabled, comments_enabled.
// Permitted: the moment's author OR the event host/cohost.
export async function PUT(req: Request, { params }: RouteParams) {
  const { id: eventId, momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: existingMoment } = await supabase
    .from("moments")
    .select("id,author_id,event_id")
    .eq("id", momentId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!existingMoment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }

  // Check permission: author, or host/cohost
  const isAuthor = (existingMoment.author_id as string) === user.id;
  if (!isAuthor) {
    const { data: editEvent } = await supabase
      .from("events")
      .select("creator_id,cohost_ids")
      .eq("id", eventId)
      .maybeSingle();

    const editCreatorId = editEvent?.creator_id as string | null;
    const editCohostIds = Array.isArray(editEvent?.cohost_ids)
      ? (editEvent.cohost_ids as string[])
      : [];

    const hostAccess = await isEventHost(supabase, eventId, user.id, { creatorId: editCreatorId, cohostIds: editCohostIds });
    if (!hostAccess) {
      return NextResponse.json({ ok: false, error: "Not authorized." }, { status: 403 });
    }
  }

  let putBody: Record<string, unknown>;
  try {
    putBody = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const text = String(putBody.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Moment text is required." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Text must be ${BODY_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const rawLink = putBody.link_url != null ? String(putBody.link_url).trim() : null;
  const linkUrl = rawLink && /^https?:\/\/.{3,}/.test(rawLink) ? rawLink : null;

  let linkTitle: string | null = null;
  let linkDescription: string | null = null;
  let linkImageUrl: string | null = null;
  let linkSiteName: string | null = null;
  if (linkUrl) {
    const preview = await fetchLinkPreview(linkUrl).catch(() => null);
    if (preview) {
      linkTitle = preview.title;
      linkDescription = preview.description;
      linkImageUrl = preview.imageUrl;
      linkSiteName = preview.siteName;
    }
  }

  const rawImage = putBody.image_url != null ? String(putBody.image_url).trim() : null;
  const imageUrl = rawImage && /^https?:\/\/.{3,}/.test(rawImage) ? rawImage : null;

  const reactionsEnabled = putBody.reactions_enabled !== false;
  const commentsEnabled = putBody.comments_enabled !== false;

  const { data: updatedMoment, error: updateError } = await supabase
    .from("moments")
    .update({
      body: text,
      link_url: linkUrl,
      link_title: linkTitle,
      link_description: linkDescription,
      link_image_url: linkImageUrl,
      link_site_name: linkSiteName,
      image_url: imageUrl,
      reactions_enabled: reactionsEnabled,
      comments_enabled: commentsEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", momentId)
    .eq("event_id", eventId)
    .select(
      "id,body,link_url,link_title,link_description,link_image_url,link_site_name,image_url,reactions_enabled,comments_enabled,updated_at"
    )
    .single();

  if (updateError || !updatedMoment) {
    console.error("[PUT moments] update failed:", updateError?.message);
    return NextResponse.json(
      { ok: false, error: updateError?.message ?? "Failed to update moment." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, moment: updatedMoment });
}

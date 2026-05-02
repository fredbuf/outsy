import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyMembership } from "../route";
import type { OrgMessageRow, MessageEventSummary } from "../route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/organizers/[id]/messages/[userId]
// Org member reads the thread with a specific user. Requires membership.
// Marks incoming (user→org) messages as read.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId, userId: otherUserId } = await params;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(otherUserId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const supabase = supabaseServer();
  const isMember = await verifyMembership(supabase, user.id, orgId);
  if (!isMember) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const [msgsResult, orgResult, profileResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,sender_id,sender_organizer_id,body,event_id,created_at,deleted_at")
      .or(
        `and(sender_id.eq.${otherUserId},recipient_organizer_id.eq.${orgId}),and(sender_organizer_id.eq.${orgId},recipient_id.eq.${otherUserId})`,
      )
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("organizers")
      .select("id,name,slug,image_url")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .eq("id", otherUserId)
      .maybeSingle(),
  ]);

  if (!orgResult.data)
    return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });
  if (!profileResult.data)
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

  const org = orgResult.data;

  // Mark user→org messages as read now that a member has opened the thread.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_id", otherUserId)
    .eq("recipient_organizer_id", orgId)
    .is("read_at", null);

  // Batch-fetch event details.
  const eventIds = [
    ...new Set(
      (msgsResult.data ?? [])
        .map((m) => m.event_id as string | null)
        .filter((id): id is string => id != null),
    ),
  ];
  const eventsMap = new Map<string, MessageEventSummary>();
  if (eventIds.length > 0) {
    const { data: events } = await supabase
      .from("events")
      .select("id,title,image_url,start_at,venues(name)")
      .in("id", eventIds);
    for (const e of events ?? []) {
      const venueRaw = Array.isArray(e.venues) ? e.venues[0] : e.venues;
      eventsMap.set(e.id as string, {
        id: e.id as string,
        title: e.title as string,
        image_url: (e.image_url as string | null) ?? null,
        start_at: (e.start_at as string | null) ?? null,
        venue_name: (venueRaw as { name: string } | null)?.name ?? null,
      });
    }
  }

  const messages: OrgMessageRow[] = (msgsResult.data ?? []).map((m) => {
    const eid = m.event_id as string | null;
    const isOrgSender = (m.sender_organizer_id as string | null) === orgId;
    return {
      id: m.id as string,
      sender_id: m.sender_id as string,
      sender_organizer_id: (m.sender_organizer_id as string | null) ?? null,
      sender_organizer: isOrgSender
        ? {
            name: org.name as string,
            slug: (org.slug as string | null) ?? null,
            image_url: (org.image_url as string | null) ?? null,
          }
        : null,
      body: m.body as string,
      event_id: eid,
      event: eid ? (eventsMap.get(eid) ?? null) : null,
      created_at: m.created_at as string,
      deleted_at: (m.deleted_at as string | null) ?? null,
    };
  });

  return NextResponse.json({
    ok: true,
    messages,
    otherUser: profileResult.data,
    organizer: {
      id: org.id as string,
      name: org.name as string,
      slug: (org.slug as string | null) ?? null,
      image_url: (org.image_url as string | null) ?? null,
    },
  });
}

// POST /api/organizers/[id]/messages/[userId]
// Org member replies to a user as the organizer. Requires membership.
// sender_id = caller's user ID (always set), sender_organizer_id = org ID.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId, userId: recipientId } = await params;
  if (!UUID_RE.test(orgId) || !UUID_RE.test(recipientId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const supabase = supabaseServer();
  const isMember = await verifyMembership(supabase, user.id, orgId);
  if (!isMember) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  let bodyJson: unknown;
  try { bodyJson = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { body: msgBody } = bodyJson as Record<string, unknown>;
  if (typeof msgBody !== "string" || !msgBody.trim())
    return NextResponse.json({ ok: false, error: "body is required." }, { status: 400 });
  if (msgBody.length > 2000)
    return NextResponse.json({ ok: false, error: "Message too long (max 2000 chars)." }, { status: 400 });

  const { data: orgResult } = await supabase
    .from("organizers")
    .select("id,name,slug,image_url")
    .eq("id", orgId)
    .maybeSingle();
  if (!orgResult) return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });

  const { data: newMsg, error: insertError } = await supabase
    .from("messages")
    .insert({
      sender_id: user.id,
      sender_organizer_id: orgId,
      recipient_id: recipientId,
      body: msgBody.trim(),
    })
    .select("id,sender_id,body,created_at")
    .single();

  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  const message: OrgMessageRow = {
    id: newMsg.id as string,
    sender_id: newMsg.sender_id as string,
    sender_organizer_id: orgId,
    sender_organizer: {
      name: orgResult.name as string,
      slug: (orgResult.slug as string | null) ?? null,
      image_url: (orgResult.image_url as string | null) ?? null,
    },
    body: newMsg.body as string,
    event_id: null,
    event: null,
    created_at: newMsg.created_at as string,
    deleted_at: null,
  };

  return NextResponse.json({ ok: true, message });
}

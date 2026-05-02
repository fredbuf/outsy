import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { OrgMessageRow, MessageEventSummary } from "../route";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/organizers/[id]/messages/me
// Returns the authenticated user's conversation with this organizer.
// Marks org→user replies as read.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const supabase = supabaseServer();

  const [msgsResult, orgResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,sender_id,sender_organizer_id,body,event_id,created_at,deleted_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_organizer_id.eq.${orgId}),and(sender_organizer_id.eq.${orgId},recipient_id.eq.${user.id})`,
      )
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("organizers")
      .select("id,name,slug,image_url")
      .eq("id", orgId)
      .maybeSingle(),
  ]);

  if (!orgResult.data)
    return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });

  const org = orgResult.data;

  // Mark org→user replies as read now that the user has viewed them.
  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("sender_organizer_id", orgId)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  // Batch-fetch event details for shared events.
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
    organizer: {
      id: org.id as string,
      name: org.name as string,
      slug: (org.slug as string | null) ?? null,
      image_url: (org.image_url as string | null) ?? null,
    },
  });
}

// POST /api/organizers/[id]/messages/me
// Any authenticated user can send a message to an organizer.
// No friendship required — organizers are publicly contactable.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  let bodyJson: unknown;
  try { bodyJson = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const { body: msgBody } = bodyJson as Record<string, unknown>;
  if (typeof msgBody !== "string" || !msgBody.trim())
    return NextResponse.json({ ok: false, error: "body is required." }, { status: 400 });
  if (msgBody.length > 2000)
    return NextResponse.json({ ok: false, error: "Message too long (max 2000 chars)." }, { status: 400 });

  const supabase = supabaseServer();

  const { data: org } = await supabase
    .from("organizers")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });

  const { data: newMsg, error: insertError } = await supabase
    .from("messages")
    .insert({
      sender_id: user.id,
      recipient_id: null,
      recipient_organizer_id: orgId,
      body: msgBody.trim(),
    })
    .select("id,sender_id,body,created_at")
    .single();

  if (insertError) return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });

  const message: OrgMessageRow = {
    id: newMsg.id as string,
    sender_id: newMsg.sender_id as string,
    sender_organizer_id: null,
    sender_organizer: null,
    body: newMsg.body as string,
    event_id: null,
    event: null,
    created_at: newMsg.created_at as string,
    deleted_at: null,
  };

  return NextResponse.json({ ok: true, message });
}

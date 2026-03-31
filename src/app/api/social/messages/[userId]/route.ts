import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export type MessageEventSummary = {
  id: string;
  title: string;
  image_url: string | null;
  start_at: string | null;
  venue_name: string | null;
};

export type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  event_id: string | null;
  event: MessageEventSummary | null;
  created_at: string;
};

// GET /api/social/messages/[userId]
// Returns messages between the authenticated user and userId, oldest first.
// Also returns the other user's profile.
// Messages with event_id have event details attached.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId: otherId } = await params;
  if (otherId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot message yourself." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const [messagesResult, profileResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,sender_id,body,event_id,created_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true })
      .limit(100),

    supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .eq("id", otherId)
      .maybeSingle(),
  ]);

  if (messagesResult.error) {
    return NextResponse.json({ ok: false, error: messagesResult.error.message }, { status: 500 });
  }

  if (!profileResult.data) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  // Batch-fetch event details for messages that are event shares
  const eventIds = [
    ...new Set(
      (messagesResult.data ?? [])
        .map((m) => m.event_id as string | null)
        .filter((id): id is string => id != null)
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

  const messages: MessageRow[] = (messagesResult.data ?? []).map((m) => {
    const eid = m.event_id as string | null;
    return {
      id: m.id as string,
      sender_id: m.sender_id as string,
      body: m.body as string,
      event_id: eid,
      event: eid ? (eventsMap.get(eid) ?? null) : null,
      created_at: m.created_at as string,
    };
  });

  return NextResponse.json({
    ok: true,
    messages,
    otherUser: profileResult.data,
  });
}

// POST /api/social/messages/[userId]
// Body: { body: string }           — send a text message
// Body: { eventId: string }        — share an event (body auto-set to event title)
// Sender and recipient must be friends.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId: recipientId } = await params;
  if (recipientId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot message yourself." }, { status: 400 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { body: msgBody, eventId } = bodyJson as Record<string, unknown>;

  const supabase = supabaseServer();

  // Require friendship
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .or(
      `and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`
    )
    .eq("status", "accepted")
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json(
      { ok: false, error: "You can only message friends." },
      { status: 403 }
    );
  }

  // ── Event share ────────────────────────────────────────────────────────────
  if (typeof eventId === "string" && eventId.trim()) {
    const { data: event } = await supabase
      .from("events")
      .select("id,title,image_url,start_at,venues(name)")
      .eq("id", eventId.trim())
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
    }

    const { data: newMessage, error: insertError } = await supabase
      .from("messages")
      .insert({
        sender_id: user.id,
        recipient_id: recipientId,
        body: event.title as string,
        event_id: event.id as string,
      })
      .select("id,sender_id,body,event_id,created_at")
      .single();

    if (insertError) {
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    const venueRaw = Array.isArray(event.venues) ? event.venues[0] : event.venues;
    const messageRow: MessageRow = {
      id: newMessage.id as string,
      sender_id: newMessage.sender_id as string,
      body: newMessage.body as string,
      event_id: event.id as string,
      event: {
        id: event.id as string,
        title: event.title as string,
        image_url: (event.image_url as string | null) ?? null,
        start_at: (event.start_at as string | null) ?? null,
        venue_name: (venueRaw as { name: string } | null)?.name ?? null,
      },
      created_at: newMessage.created_at as string,
    };

    return NextResponse.json({ ok: true, message: messageRow });
  }

  // ── Text message ───────────────────────────────────────────────────────────
  if (typeof msgBody !== "string" || !msgBody.trim()) {
    return NextResponse.json({ ok: false, error: "body is required." }, { status: 400 });
  }
  if (msgBody.length > 2000) {
    return NextResponse.json({ ok: false, error: "Message too long (max 2000 chars)." }, { status: 400 });
  }

  const { data: newMessage, error: insertError } = await supabase
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipientId, body: msgBody.trim() })
    .select("id,sender_id,body,event_id,created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const messageRow: MessageRow = {
    id: newMessage.id as string,
    sender_id: newMessage.sender_id as string,
    body: newMessage.body as string,
    event_id: null,
    event: null,
    created_at: newMessage.created_at as string,
  };

  return NextResponse.json({ ok: true, message: messageRow });
}

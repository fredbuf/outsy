import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createOrgNotification } from "@/lib/notifications";

const VALID_RESPONSES = new Set(["going", "maybe", "cant_go"]);

async function getCounts(supabase: ReturnType<typeof supabaseServer>, eventId: string) {
  const { data } = await supabase
    .from("rsvps")
    .select("response")
    .eq("event_id", eventId);

  const counts = { going: 0, maybe: 0, cant_go: 0 };
  for (const row of data ?? []) {
    if (row.response === "going") counts.going++;
    else if (row.response === "maybe") counts.maybe++;
    else if (row.response === "cant_go") counts.cant_go++;
  }
  return counts;
}

// Returns counts + the authenticated user's current RSVP (if any).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = supabaseServer();
  const counts = await getCounts(supabase, id);

  let myResponse: string | null = null;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data } = await supabase
        .from("rsvps")
        .select("response")
        .eq("event_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      myResponse = data?.response ?? null;
    }
  }

  return NextResponse.json({ ok: true, counts, myResponse });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth check
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to RSVP." }, { status: 401 });
  }
  const supabase = supabaseServer();
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "Invalid session. Please sign in again." }, { status: 401 });
  }

  const { id } = await params;

  // Verify event exists and fetch host info for notifications
  const { data: event } = await supabase
    .from("events")
    .select("id,title,creator_id,cohost_ids")
    .eq("id", id)
    .maybeSingle();


  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const response = String((body as Record<string, unknown>).response ?? "");
  if (!VALID_RESPONSES.has(response)) {
    return NextResponse.json({ ok: false, error: "Invalid RSVP response." }, { status: 400 });
  }

  const { error } = await supabase
    .from("rsvps")
    .upsert(
      {
        event_id: id,
        user_id: authUser.id,
        response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,user_id" }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, error: `RSVP failed: ${error.message}` },
      { status: 500 }
    );
  }

  // Notify the event creator and all cohosts — except the person who just RSVPed.
  try {
    const creatorId = event.creator_id as string | null;
    const cohostIds = Array.isArray(event.cohost_ids) ? (event.cohost_ids as string[]) : [];
    const recipients = new Set<string>([
      ...(creatorId ? [creatorId] : []),
      ...cohostIds,
    ]);
    recipients.delete(authUser.id); // don't notify yourself

    if (recipients.size > 0) {
      const eventTitle = event.title as string;
      const rows = [...recipients].map((uid) => ({
        user_id: uid,
        type: "rsvp_received",
        actor_id: authUser.id,
        entity_id: id,
        metadata: { event_id: id, event_title: eventTitle, rsvp_response: response },
      }));
      await supabase.from("notifications").insert(rows);
    }
  } catch {
    // Non-critical
  }

  // Notify each organizer linked to this event.
  try {
    const { data: orgLinks } = await supabase
      .from("event_organizers")
      .select("organizer_id")
      .eq("event_id", id);
    if (orgLinks && orgLinks.length > 0) {
      const eventTitle = event.title as string;
      await Promise.all(
        orgLinks.map((link) =>
          createOrgNotification({
            organizerId: link.organizer_id as string,
            actorId: authUser.id,
            type: "organizer_new_rsvp",
            entityId: id,
            metadata: { event_id: id, event_title: eventTitle, rsvp_response: response },
          })
        )
      );
    }
  } catch {
    // Non-critical
  }

  const counts = await getCounts(supabase, id);
  return NextResponse.json({ ok: true, counts });
}

// DELETE /api/events/[id]/rsvp — remove the caller's RSVP entirely
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to RSVP." }, { status: 401 });
  }
  const supabase = supabaseServer();
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "Invalid session. Please sign in again." }, { status: 401 });
  }

  const { id } = await params;

  await supabase
    .from("rsvps")
    .delete()
    .eq("event_id", id)
    .eq("user_id", authUser.id);

  const counts = await getCounts(supabase, id);
  return NextResponse.json({ ok: true, counts });
}

import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── GET /api/organizers/[id]/events ──────────────────────────────────────────
// Returns all events linked to this organizer that the caller manages.
// Uses service-role so it sees private and unapproved events — intentionally
// does NOT apply the public-discovery filters used by /o/[slug].

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid organizer id." }, { status: 400 });
  }

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Verify active membership — owner, admin, or editor may manage events.
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("id")
    .eq("organizer_id", id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin", "editor"])
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "You do not have access to this organizer's events." },
      { status: 403 },
    );
  }

  // Step 1 — collect event IDs linked to this organizer.
  const { data: links, error: linksError } = await supabase
    .from("event_organizers")
    .select("event_id")
    .eq("organizer_id", id);

  if (linksError) {
    console.error("[GET /api/organizers/[id]/events] links query:", linksError.message);
    return NextResponse.json({ ok: false, error: "Failed to load events." }, { status: 500 });
  }

  const eventIds = (links ?? []).map((l) => l.event_id as string);

  if (eventIds.length === 0) {
    return NextResponse.json({ ok: true, events: [] });
  }

  // Step 2 — fetch those events without public-discovery filters.
  // Service-role bypasses RLS, so private and unapproved events are included.
  const { data, error: eventsError } = await supabase
    .from("events")
    .select("id,title,start_at,image_url,visibility,is_approved,is_rejected,status,venues(name,city)")
    .in("id", eventIds)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .order("start_at", { ascending: true });

  if (eventsError) {
    console.error("[GET /api/organizers/[id]/events] events query:", eventsError.message);
    return NextResponse.json({ ok: false, error: "Failed to load events." }, { status: 500 });
  }

  const events = (data ?? []).map((ev) => {
    const venue = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
    return {
      id:          ev.id as string,
      title:       ev.title as string,
      start_at:    ev.start_at as string,
      image_url:   (ev.image_url ?? null) as string | null,
      visibility:  ev.visibility as string,
      is_approved: ev.is_approved as boolean,
      venue_name:  (venue as { name?: string } | null)?.name ?? null,
      venue_city:  (venue as { city?: string } | null)?.city ?? null,
    };
  });

  return NextResponse.json({ ok: true, events });
}

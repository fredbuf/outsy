import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Usernames: 3–30 chars, lowercase letters / digits / underscores only.
const USERNAME_RE = /^[a-z0-9_]{3,30}$/;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/profile — returns the caller's profile + their own events.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,display_name,username,avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { data: events } = await supabase
    .from("events")
    .select("id,title,start_at,category_primary,image_url,visibility,is_approved,status")
    .eq("creator_id", user.id)
    .order("start_at", { ascending: false })
    .limit(50);

  // Fetch events the user has RSVP'd to (going + maybe), upcoming only
  const now = new Date().toISOString();
  const { data: rsvpRows } = await supabase
    .from("rsvps")
    .select("response,events!event_id(id,title,start_at,category_primary,image_url,visibility,is_approved,status)")
    .eq("user_id", user.id)
    .in("response", ["going", "maybe"])
    .limit(100);

  type RsvpEventRow = {
    id: string;
    title: string;
    start_at: string;
    category_primary: string;
    image_url: string | null;
    visibility: string;
    is_approved: boolean;
    status: string;
  };

  const going: RsvpEventRow[] = [];
  const interested: RsvpEventRow[] = [];

  for (const row of (rsvpRows ?? []) as { response: string; events: RsvpEventRow | RsvpEventRow[] | null }[]) {
    const ev = Array.isArray(row.events) ? row.events[0] : row.events;
    if (!ev || ev.start_at < now) continue;
    if (row.response === "going") going.push(ev);
    else if (row.response === "maybe") interested.push(ev);
  }

  going.sort((a, b) => a.start_at.localeCompare(b.start_at));
  interested.sort((a, b) => a.start_at.localeCompare(b.start_at));

  return NextResponse.json({ ok: true, profile: profile ?? null, events: events ?? [], going, interested });
}

// PATCH /api/profile — update display_name and/or username.
export async function PATCH(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { display_name, username } = body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof display_name === "string") {
    const trimmed = display_name.trim();
    if (trimmed.length > 80) {
      return NextResponse.json(
        { ok: false, error: "Display name must be 80 characters or fewer." },
        { status: 400 }
      );
    }
    patch.display_name = trimmed || null;
  }

  if (typeof username === "string") {
    const normalized = username.trim().toLowerCase();
    if (normalized === "") {
      patch.username = null;
    } else {
      if (!USERNAME_RE.test(normalized)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Username must be 3–30 characters and contain only lowercase letters, numbers, and underscores.",
          },
          { status: 400 }
        );
      }
      patch.username = normalized;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseServer()
    .from("profiles")
    .update(patch)
    .eq("id", user.id)
    .select("id,display_name,username,avatar_url")
    .single();

  if (error) {
    // Unique constraint violation → username taken.
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "That username is already taken." },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, profile: data });
}

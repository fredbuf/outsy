import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

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

  // Verify event exists
  const { data: event } = await supabase
    .from("events")
    .select("id")
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

  const counts = await getCounts(supabase, id);
  return NextResponse.json({ ok: true, counts });
}

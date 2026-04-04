import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const VALID_EMOJI = ["❤️", "🔥", "👏", "🙌", "✨"] as const;
type ValidEmoji = (typeof VALID_EMOJI)[number];

function isValidEmoji(v: unknown): v is ValidEmoji {
  return VALID_EMOJI.includes(v as ValidEmoji);
}

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

// POST /api/events/[id]/moments/[momentId]/reactions
// Body: { emoji: string }
// Adds a reaction. Idempotent (duplicate ignored via unique constraint).
export async function POST(req: Request, { params }: RouteParams) {
  const { momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!isValidEmoji(body.emoji)) {
    return NextResponse.json({ ok: false, error: "Invalid emoji." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify moment exists and reactions are enabled
  const { data: moment } = await supabase
    .from("moments")
    .select("id,reactions_enabled")
    .eq("id", momentId)
    .maybeSingle();

  if (!moment) {
    return NextResponse.json({ ok: false, error: "Moment not found." }, { status: 404 });
  }
  if (!moment.reactions_enabled) {
    return NextResponse.json(
      { ok: false, error: "Reactions are disabled for this moment." },
      { status: 403 }
    );
  }

  // Insert — ignore conflict (already reacted)
  const { error } = await supabase.from("moment_reactions").upsert(
    { moment_id: momentId, user_id: user.id, emoji: body.emoji },
    { onConflict: "moment_id,user_id,emoji", ignoreDuplicates: true }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/events/[id]/moments/[momentId]/reactions
// Body: { emoji: string }
// Removes the caller's reaction.
export async function DELETE(req: Request, { params }: RouteParams) {
  const { momentId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  if (!isValidEmoji(body.emoji)) {
    return NextResponse.json({ ok: false, error: "Invalid emoji." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { error } = await supabase
    .from("moment_reactions")
    .delete()
    .eq("moment_id", momentId)
    .eq("user_id", user.id)
    .eq("emoji", body.emoji);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

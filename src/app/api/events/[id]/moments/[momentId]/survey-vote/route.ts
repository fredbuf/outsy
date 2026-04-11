import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// POST /api/events/[id]/moments/[momentId]/survey-vote
// Body: { option_id: string }
// Upserts the user's vote — calling again with a different option_id changes the vote.
// Calling with the same option_id that is already voted removes it (toggle off).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; momentId: string }> }
) {
  const { id: eventId, momentId } = await params;

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const supabase = supabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const optionId = typeof body.option_id === "string" ? body.option_id.trim() : null;
  if (!optionId) {
    return NextResponse.json({ ok: false, error: "option_id required." }, { status: 400 });
  }

  // Verify the moment exists and belongs to this event
  const { data: moment } = await supabase
    .from("moments")
    .select("id, survey_question, event_id")
    .eq("id", momentId)
    .eq("event_id", eventId)
    .maybeSingle();

  if (!moment || !moment.survey_question) {
    return NextResponse.json({ ok: false, error: "Survey not found." }, { status: 404 });
  }

  // Verify the option belongs to this moment
  const { data: option } = await supabase
    .from("survey_options")
    .select("id")
    .eq("id", optionId)
    .eq("moment_id", momentId)
    .maybeSingle();

  if (!option) {
    return NextResponse.json({ ok: false, error: "Option not found." }, { status: 404 });
  }

  // Check for existing vote
  const { data: existing } = await supabase
    .from("survey_votes")
    .select("id, option_id")
    .eq("moment_id", momentId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing) {
    if (existing.option_id === optionId) {
      // Same option — toggle off (remove vote)
      await supabase.from("survey_votes").delete().eq("id", existing.id);
      return NextResponse.json({ ok: true, action: "removed" });
    }
    // Different option — change vote
    await supabase
      .from("survey_votes")
      .update({ option_id: optionId, created_at: new Date().toISOString() })
      .eq("id", existing.id);
    return NextResponse.json({ ok: true, action: "changed" });
  }

  // No existing vote — insert
  const { error: insertError } = await supabase.from("survey_votes").insert({
    moment_id: momentId,
    option_id: optionId,
    user_id: user.id,
  });

  if (insertError) {
    console.error("[survey-vote] insert failed:", insertError.message);
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, action: "voted" });
}

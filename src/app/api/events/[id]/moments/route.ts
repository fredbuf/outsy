import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchLinkPreview } from "@/lib/fetch-link-preview";

// Never cache this route — always fetch fresh moments from Supabase.
export const dynamic = "force-dynamic";

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

// GET /api/events/[id]/moments — public read, no auth required
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;
  const supabase = supabaseServer();

  // Fetch moments without the profiles join (avoids FK relationship assumption)
  const { data: rows, error } = await supabase
    .from("moments")
    .select(
      "id,event_id,author_id,body,survey_question,link_url,link_title,link_description,link_image_url,link_site_name,image_url,is_pinned,reactions_enabled,comments_enabled,created_at," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET moments] query failed:", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const moments = (rows ?? []) as unknown as Array<Record<string, unknown>>;

  // Batch-fetch author profiles separately
  const authorIds = [...new Set(moments.map((r) => r.author_id as string))];
  const profilesMap = new Map<
    string,
    { display_name: string | null; avatar_url: string | null; username: string | null }
  >();
  if (authorIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id,display_name,avatar_url,username")
      .in("id", authorIds);
    if (profilesError) {
      console.error("[GET moments] profiles fetch failed:", profilesError.message);
    }
    for (const p of profiles ?? []) {
      profilesMap.set(p.id as string, {
        display_name: p.display_name as string | null,
        avatar_url: p.avatar_url as string | null,
        username: p.username as string | null,
      });
    }
  }

  // Batch-fetch comment counts
  const momentIds = moments.map((r) => r.id as string);
  const commentCountMap = new Map<string, number>();
  if (momentIds.length > 0) {
    const { data: commentRows } = await supabase
      .from("comments")
      .select("moment_id")
      .in("moment_id", momentIds);
    for (const row of commentRows ?? []) {
      const mid = row.moment_id as string;
      commentCountMap.set(mid, (commentCountMap.get(mid) ?? 0) + 1);
    }
  }

  // Batch-fetch survey options + votes for survey moments
  const surveyMomentIds = moments
    .filter((r) => r.survey_question != null)
    .map((r) => r.id as string);

  type SurveyOptionRow = { id: string; moment_id: string; position: number; text: string };
  type SurveyVoteRow = { option_id: string; user_id: string };
  const optionsMap = new Map<string, SurveyOptionRow[]>(); // moment_id → options
  const votesMap = new Map<string, SurveyVoteRow[]>();    // option_id → votes

  if (surveyMomentIds.length > 0) {
    const { data: optRows } = await supabase
      .from("survey_options")
      .select("id,moment_id,position,text")
      .in("moment_id", surveyMomentIds)
      .order("position", { ascending: true });

    for (const o of (optRows ?? []) as SurveyOptionRow[]) {
      const arr = optionsMap.get(o.moment_id) ?? [];
      arr.push(o);
      optionsMap.set(o.moment_id, arr);
    }

    const allOptionIds = (optRows ?? []).map((o) => (o as SurveyOptionRow).id);
    if (allOptionIds.length > 0) {
      const { data: voteRows } = await supabase
        .from("survey_votes")
        .select("option_id,user_id")
        .in("option_id", allOptionIds);

      for (const v of (voteRows ?? []) as SurveyVoteRow[]) {
        const arr = votesMap.get(v.option_id) ?? [];
        arr.push(v);
        votesMap.set(v.option_id, arr);
      }
    }
  }

  const result = moments.map((row) => {
    const mid = row.id as string;
    const opts = optionsMap.get(mid) ?? [];
    const surveyOptions = opts.map((o) => ({
      id: o.id,
      text: o.text,
      position: o.position,
      votes: (votesMap.get(o.id) ?? []).map((v) => ({ user_id: v.user_id })),
    }));
    return {
      ...row,
      profiles: profilesMap.get(row.author_id as string) ?? null,
      comment_count: commentCountMap.get(mid) ?? 0,
      survey_options: surveyOptions,
    };
  });

  return NextResponse.json({ ok: true, moments: result });
}

// POST /api/events/[id]/moments — create a moment
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: eventId } = await params;

  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // Fetch event and permission fields
  const { data: event } = await supabase
    .from("events")
    .select("id,title,creator_id,cohost_ids,is_approved,is_rejected")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  if (!event.is_approved || event.is_rejected) {
    return NextResponse.json({ ok: false, error: "Event not available." }, { status: 403 });
  }

  const creatorId = event.creator_id as string | null;
  const cohostIds = Array.isArray(event.cohost_ids)
    ? (event.cohost_ids as string[])
    : [];
  const isHost = creatorId === user.id;
  const isCohost = cohostIds.includes(user.id);

  // Read moments_guests_can_post (new column — defaults false if absent)
  const guestsCanPost = Boolean(
    (event as Record<string, unknown>).moments_guests_can_post ?? false
  );

  if (!isHost && !isCohost && !guestsCanPost) {
    return NextResponse.json(
      { ok: false, error: "Posting is not enabled for this event." },
      { status: 403 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const text = String(body.body ?? "").trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: "Moment text is required." }, { status: 400 });
  }
  if (text.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: `Text must be ${BODY_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  // Optional survey
  const rawSurveyQuestion = body.survey_question != null
    ? String(body.survey_question).trim()
    : null;
  const surveyQuestion = rawSurveyQuestion && rawSurveyQuestion.length > 0
    ? rawSurveyQuestion
    : null;

  const rawSurveyOptions = Array.isArray(body.survey_options)
    ? (body.survey_options as unknown[])
        .map((o) => String(o).trim())
        .filter((o) => o.length > 0)
    : [];
  // Survey valid only if question + 2-5 options
  const surveyOptionsValid =
    surveyQuestion != null &&
    rawSurveyOptions.length >= 2 &&
    rawSurveyOptions.length <= 5;

  // Optional link — basic URL validation
  const rawLink = body.link_url != null ? String(body.link_url).trim() : null;
  const linkUrl = rawLink && /^https?:\/\/.{3,}/.test(rawLink) ? rawLink : null;

  // Fetch OG preview metadata server-side (non-blocking fallback to nulls)
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

  // Optional image URL — must be a Supabase storage URL or similar https URL
  const rawImage = body.image_url != null ? String(body.image_url).trim() : null;
  const imageUrl = rawImage && /^https?:\/\/.{3,}/.test(rawImage) ? rawImage : null;

  const reactionsEnabled = body.reactions_enabled !== false;
  const commentsEnabled = body.comments_enabled !== false;
  const isPinned = (isHost || isCohost) && body.is_pinned === true;

  // Unpin any existing pinned moment before pinning the new one
  if (isPinned) {
    await supabase
      .from("moments")
      .update({ is_pinned: false })
      .eq("event_id", eventId)
      .eq("is_pinned", true);
  }

  const { data: newMoment, error: insertError } = await supabase
    .from("moments")
    .insert({
      event_id: eventId,
      author_id: user.id,
      body: text,
      survey_question: surveyOptionsValid ? surveyQuestion : null,
      link_url: linkUrl,
      link_title: linkTitle,
      link_description: linkDescription,
      link_image_url: linkImageUrl,
      link_site_name: linkSiteName,
      image_url: imageUrl,
      is_pinned: isPinned,
      reactions_enabled: reactionsEnabled,
      comments_enabled: commentsEnabled,
    })
    .select("id,event_id,author_id,body,survey_question,link_url,link_title,link_description,link_image_url,link_site_name,image_url,is_pinned,reactions_enabled,comments_enabled,created_at")
    .single();

  if (insertError || !newMoment) {
    console.error("[POST moments] insert failed:", insertError?.message);
    return NextResponse.json(
      { ok: false, error: insertError?.message ?? "Failed to create moment." },
      { status: 500 }
    );
  }

  // Insert survey options if this is a survey moment
  let surveyOptions: { id: string; text: string; position: number; votes: { user_id: string }[] }[] = [];
  if (surveyOptionsValid && rawSurveyOptions.length > 0) {
    const optionRows = rawSurveyOptions.map((text, i) => ({
      moment_id: (newMoment as { id: string }).id,
      position: i,
      text,
    }));
    const { data: insertedOptions } = await supabase
      .from("survey_options")
      .insert(optionRows)
      .select("id,text,position");
    surveyOptions = ((insertedOptions ?? []) as { id: string; text: string; position: number }[]).map((o) => ({
      ...o,
      votes: [],
    }));
  }

  // Notify all "going" RSVPs (fire-and-forget; non-critical)
  try {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("response", "going");

    const recipientIds = (rsvps ?? [])
      .map((r) => r.user_id as string)
      .filter((uid) => uid !== user.id);

    if (recipientIds.length > 0) {
      const eventTitle = event.title as string;
      const notifications = recipientIds.map((uid) => ({
        user_id: uid,
        type: "moment_posted",
        actor_id: user.id,
        entity_id: (newMoment as { id: string }).id,
        metadata: { event_id: eventId, event_title: eventTitle },
      }));
      await supabase.from("notifications").insert(notifications);
    }
  } catch {
    // Non-critical: ignore errors
  }

  return NextResponse.json({ ok: true, moment: { ...newMoment, survey_options: surveyOptions } });
}

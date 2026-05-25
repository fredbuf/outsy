import "server-only";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchEventOrganizerIds } from "@/lib/event-host";

// Never serve a cached page — always re-render so moments are fresh from Supabase.
export const dynamic = "force-dynamic";
import { MomentsClient } from "./MomentsClient";

type MomentReactionRow = { user_id: string; emoji: string };
type AuthorProfile = {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};
export type SurveyVoter = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username?: string | null;
};

export type SurveyOptionRow = {
  id: string;
  text: string;
  position: number;
  votes: SurveyVoter[];
};

export type MomentRow = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  survey_question: string | null;
  survey_options?: SurveyOptionRow[];
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  link_site_name: string | null;
  image_url: string | null;
  is_pinned: boolean;
  reactions_enabled: boolean;
  comments_enabled: boolean;
  created_at: string;
  updated_at: string | null;
  profiles: AuthorProfile | AuthorProfile[] | null;
  moment_reactions: MomentReactionRow[] | null;
  comment_count?: number;
};

async function fetchEventForMoments(id: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,image_url,category_primary,creator_id,cohost_ids,is_approved,is_rejected,visibility"
    )
    .eq("id", id)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .maybeSingle();
  return data;
}

async function fetchMoments(eventId: string): Promise<MomentRow[]> {
  const supabase = supabaseServer();

  const { data: rows, error } = await supabase
    .from("moments")
    .select(
      "id,event_id,author_id,body,survey_question,link_url,link_title,link_description,link_image_url,link_site_name,image_url,is_pinned,reactions_enabled,comments_enabled,created_at,updated_at," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchMoments/page] query failed:", error.message);
    return [];
  }

  const moments = (rows ?? []) as unknown as Array<Record<string, unknown>>;

  // Batch-fetch author profiles separately (avoids FK relationship assumption)
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
      console.error("[fetchMoments/page] profiles fetch failed:", profilesError.message);
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
    .filter((r) => (r as Record<string, unknown>).survey_question != null)
    .map((r) => r.id as string);
  const surveyOptionsMap = new Map<string, SurveyOptionRow[]>();
  if (surveyMomentIds.length > 0) {
    const { data: optRows } = await supabase
      .from("survey_options")
      .select("id,moment_id,position,text")
      .in("moment_id", surveyMomentIds)
      .order("position", { ascending: true });
    const allOptIds = (optRows ?? []).map((o) => (o as { id: string }).id);
    const votesMap = new Map<string, SurveyVoter[]>();
    if (allOptIds.length > 0) {
      const { data: voteRows } = await supabase
        .from("survey_votes")
        .select("option_id,user_id")
        .in("option_id", allOptIds);

      // Batch-fetch voter profiles
      const voterIds = [...new Set((voteRows ?? []).map((v) => (v as { user_id: string }).user_id))];
      const voterProfilesMap = new Map<string, { display_name: string | null; avatar_url: string | null; username: string | null }>();
      if (voterIds.length > 0) {
        const { data: voterProfiles } = await supabase
          .from("profiles")
          .select("id,display_name,avatar_url,username")
          .in("id", voterIds);
        for (const p of voterProfiles ?? []) {
          voterProfilesMap.set(p.id as string, {
            display_name: p.display_name as string | null,
            avatar_url: p.avatar_url as string | null,
            username: p.username as string | null,
          });
        }
      }

      for (const v of voteRows ?? []) {
        const optId = (v as { option_id: string }).option_id;
        const userId = (v as { user_id: string }).user_id;
        const profile = voterProfilesMap.get(userId);
        const arr = votesMap.get(optId) ?? [];
        arr.push({ user_id: userId, display_name: profile?.display_name ?? null, avatar_url: profile?.avatar_url ?? null, username: profile?.username ?? null });
        votesMap.set(optId, arr);
      }
    }
    for (const o of optRows ?? []) {
      const opt = o as { id: string; moment_id: string; position: number; text: string };
      const arr = surveyOptionsMap.get(opt.moment_id) ?? [];
      arr.push({ id: opt.id, text: opt.text, position: opt.position, votes: votesMap.get(opt.id) ?? [] });
      surveyOptionsMap.set(opt.moment_id, arr);
    }
  }

  return moments.map((row) => ({
    ...row,
    profiles: profilesMap.get(row.author_id as string) ?? null,
    comment_count: commentCountMap.get(row.id as string) ?? 0,
    survey_options: surveyOptionsMap.get(row.id as string) ?? [],
  })) as unknown as MomentRow[];
}

export default async function MomentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const event = await fetchEventForMoments(id);
  if (!event) notFound();

  // Private events: skip SSR pre-load — no auth context in RSC.
  // MomentsClient refetches immediately from the gated API route.
  const [moments, eventOrganizerIds] = await Promise.all([
    (event as Record<string, unknown>).visibility === "private"
      ? Promise.resolve([])
      : fetchMoments(id),
    fetchEventOrganizerIds(supabaseServer(), id),
  ]);

  const creatorId = event.creator_id as string | null;
  const cohostIds = Array.isArray(event.cohost_ids)
    ? (event.cohost_ids as string[])
    : [];

  // Read optional permission columns (may not exist before migration)
  const guestsCanPost = Boolean(
    (event as Record<string, unknown>).moments_guests_can_post ?? false
  );
  const guestsCanReact = (event as Record<string, unknown>).moments_guests_can_react !== false;

  return (
    <MomentsClient
      eventId={id}
      eventTitle={event.title as string}
      creatorId={creatorId}
      cohostIds={cohostIds}
      eventOrganizerIds={eventOrganizerIds}
      guestsCanPost={guestsCanPost}
      guestsCanReact={guestsCanReact}
      initialMoments={moments}
      visibility={(event as Record<string, unknown>).visibility as "public" | "unlisted" | "private" ?? "public"}
    />
  );
}

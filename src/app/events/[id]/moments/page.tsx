import "server-only";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { MomentsClient } from "./MomentsClient";

type MomentReactionRow = { user_id: string; emoji: string };
type AuthorProfile = {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};
export type MomentRow = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  reactions_enabled: boolean;
  created_at: string;
  profiles: AuthorProfile | AuthorProfile[] | null;
  moment_reactions: MomentReactionRow[] | null;
};

async function fetchEventForMoments(id: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,image_url,category_primary,creator_id,cohost_ids,is_approved,is_rejected"
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
      "id,event_id,author_id,body,is_pinned,reactions_enabled,created_at," +
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

  return moments.map((row) => ({
    ...row,
    profiles: profilesMap.get(row.author_id as string) ?? null,
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

  const moments = await fetchMoments(id);

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
      eventImageUrl={(event.image_url as string | null) ?? null}
      eventCategory={event.category_primary as string}
      creatorId={creatorId}
      cohostIds={cohostIds}
      guestsCanPost={guestsCanPost}
      guestsCanReact={guestsCanReact}
      initialMoments={moments}
    />
  );
}

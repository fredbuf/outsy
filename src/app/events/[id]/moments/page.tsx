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
  const { data } = await supabaseServer()
    .from("moments")
    .select(
      "id,event_id,author_id,body,is_pinned,reactions_enabled,created_at," +
        "profiles(display_name,avatar_url,username)," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as MomentRow[];
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

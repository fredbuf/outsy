/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase-server";
import { FriendshipButton } from "@/app/profile/[userId]/FriendshipButton";
import { BackButton } from "@/app/events/[id]/BackButton";
import { PublicProfileCounters, type PublicEvent } from "./PublicProfileCounters";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── DB queries ─────────────────────────────────────────────────────────────────

const fetchProfile = cache(async (username: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,custom_avatar_url,username")
    .eq("username", username)
    .maybeSingle();
  return data;
});

async function fetchUserHandle(userId: string): Promise<string | null> {
  const { data } = await supabaseServer()
    .from("handles")
    .select("handle")
    .eq("owner_type", "user")
    .eq("owner_id", userId)
    .maybeSingle();
  return data?.handle ?? null;
}

async function fetchUpcomingEvents(creatorId: string): Promise<PublicEvent[]> {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,image_url")
    .eq("creator_id", creatorId)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .eq("visibility", "public")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(20);
  return (data ?? []) as PublicEvent[];
}

async function fetchFriendsCount(userId: string): Promise<number> {
  const { count } = await supabaseServer()
    .from("friendships")
    .select("*", { count: "exact", head: true })
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .eq("status", "accepted");
  return count ?? 0;
}

async function fetchFollowingCount(userId: string): Promise<number> {
  const { count } = await supabaseServer()
    .from("organizer_followers")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// ── Metadata ───────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) return { title: "User not found | Outsy" };
  const name = profile.display_name ?? `@${username}`;
  return {
    title: `${name} | Outsy`,
    description: `${name} on Outsy Montréal`,
    openGraph: {
      title: `${name} | Outsy`,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : [],
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  const [events, friendsCount, followingCount, globalHandle] = await Promise.all([
    fetchUpcomingEvents(profile.id),
    fetchFriendsCount(profile.id),
    fetchFollowingCount(profile.id),
    fetchUserHandle(profile.id),
  ]);

  const displayName = profile.display_name ?? `@${username}`;

  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        display: "grid",
        gap: 36,
        minHeight: "100dvh",
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* ── Identity block ── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, paddingTop: 8, position: "relative" }}>

        {/* Back button — top-left */}
        <BackButton
          style={{
            position: "absolute", top: 0, left: 0,
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            cursor: "pointer", color: "#C7D0DB",
            display: "flex", alignItems: "center", justifyContent: "center",
          } as React.CSSProperties}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </BackButton>

        {/* Avatar + glass card wrapper */}
        <div style={{ position: "relative", width: "100%", maxWidth: 360, paddingTop: 48, marginTop: 8 }}>

          {/* Avatar — absolute, overlapping glass card from above */}
          <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
            <GeneratedAvatar name={displayName} imageUrl={profile.custom_avatar_url} size={96} style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.45)" }} />
          </div>

          {/* Glass identity card */}
          <div style={{
            width: "100%",
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 24,
            paddingTop: 60,
            paddingBottom: 20,
            paddingLeft: 16,
            paddingRight: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}>
            {/* Name */}
            <div style={{ fontSize: 28, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.025em", lineHeight: 1.1, textAlign: "center" }}>
              {displayName}
            </div>
            {/* Handle */}
            {(globalHandle ?? profile.username) && (
              <div style={{ fontSize: 11, fontWeight: 400, color: "#8C98A8", letterSpacing: "0.01em" }}>
                @{globalHandle ?? profile.username}
              </div>
            )}

            {/* Stats row */}
            <PublicProfileCounters
              friendsCount={friendsCount}
              followingCount={followingCount}
              eventsCount={events.length}
              events={events}
            />
          </div>
        </div>

        {/* Action button — below the glass card */}
        <div style={{ marginTop: 16 }}>
          <FriendshipButton profileId={profile.id} profileUsername={profile.username} />
        </div>

      </section>
    </main>
  );
}

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
    .select("id,display_name,avatar_url,custom_avatar_url,username,bio,website_url,instagram_url,tiktok_url,youtube_url")
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
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -1 }}>
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

            {/* Bio */}
            {profile.bio && (
              <p style={{ fontSize: 13, fontWeight: 500, color: "#8C98A8", textAlign: "center", margin: "6px 0 0", lineHeight: 1.6, maxWidth: 260 }}>
                {profile.bio}
              </p>
            )}

            {/* Social link pills */}
            {(profile.website_url || profile.instagram_url || profile.tiktok_url || profile.youtube_url) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
                {profile.website_url && (
                  <a href={profile.website_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: "#C7D0DB", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none" }}>
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                    Website
                  </a>
                )}
                {profile.instagram_url && (
                  <a href={profile.instagram_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: "#C7D0DB", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none" }}>
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>
                    Instagram
                  </a>
                )}
                {profile.tiktok_url && (
                  <a href={profile.tiktok_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: "#C7D0DB", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none" }}>
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" /></svg>
                    TikTok
                  </a>
                )}
                {profile.youtube_url && (
                  <a href={profile.youtube_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500, color: "#C7D0DB", padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", textDecoration: "none" }}>
                    <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" /><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" /></svg>
                    YouTube
                  </a>
                )}
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

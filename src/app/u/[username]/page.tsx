/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { FriendshipButton } from "@/app/profile/[userId]/FriendshipButton";
import { PublicProfileCounters, type PublicEvent } from "./PublicProfileCounters";

// ── DB queries ─────────────────────────────────────────────────────────────────

const fetchProfile = cache(async (username: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,username")
    .eq("username", username)
    .maybeSingle();
  return data;
});

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

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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

  const [events, friendsCount] = await Promise.all([
    fetchUpcomingEvents(profile.id),
    fetchFriendsCount(profile.id),
  ]);

  const displayName = profile.display_name ?? `@${username}`;

  return (
    <main
      className="page-main"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        display: "grid",
        gap: 36,
        background: "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)",
      }}
    >
      <Link href="/events" style={{ opacity: 0.55, fontSize: 14, textDecoration: "none" }}>
        ← Back
      </Link>

      {/* ── Identity block — same structure as own profile ── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>

        {/* Avatar — 96px to match own profile */}
        <div style={{ width: 96, height: 96, flexShrink: 0 }}>
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
                border: "2px solid var(--border-medium)",
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: getAvatarColor(displayName),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color: "#fff",
                userSelect: "none",
                border: "2px solid var(--border-medium)",
              }}
            >
              {getInitials(displayName)}
            </div>
          )}
        </div>

        {/* Name + username */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {displayName}
          </div>
          {profile.username && (
            <div style={{ fontSize: 14, opacity: 0.5, marginTop: 4 }}>
              @{profile.username}
            </div>
          )}
        </div>

        {/* Friendship action — replaces Edit/Share on own profile */}
        <div style={{ marginTop: 2 }}>
          <FriendshipButton profileId={profile.id} profileUsername={profile.username} />
        </div>

        {/* Summary counters + detail sheets */}
        <PublicProfileCounters
          friendsCount={friendsCount}
          eventsCount={events.length}
          events={events}
        />
      </section>
    </main>
  );
}

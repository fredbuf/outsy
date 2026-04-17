/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { FriendshipButton } from "./FriendshipButton";
import { BackButton } from "../../events/[id]/BackButton";

// ── DB queries ────────────────────────────────────────────────────────────────

const fetchProfile = cache(async (userId: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,username")
    .eq("id", userId)
    .maybeSingle();
  return data;
});

async function fetchFriendCount(userId: string): Promise<number> {
  const { count } = await supabaseServer()
    .from("friendships")
    .select("*", { count: "exact", head: true })
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
  return count ?? 0;
}

type HostedEvent = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  image_url: string | null;
  venues: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
};

async function fetchUpcomingEvents(creatorId: string): Promise<HostedEvent[]> {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,image_url,venues(name,city)")
    .eq("creator_id", creatorId)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .eq("visibility", "public")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(20);
  return (data ?? []) as HostedEvent[];
}

async function fetchPastEvents(creatorId: string): Promise<HostedEvent[]> {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,image_url,venues(name,city)")
    .eq("creator_id", creatorId)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .eq("visibility", "public")
    .lt("start_at", new Date().toISOString())
    .order("start_at", { ascending: false })
    .limit(20);
  return (data ?? []) as HostedEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_LABELS: Record<string, string> = {
  concerts: "Concerts", nightlife: "Nightlife",
  arts_culture: "Arts & Culture", comedy: "Comedy",
  sports: "Sports", family: "Family",
  music: "Concerts", art: "Arts & Culture",
};

// ── UI components ─────────────────────────────────────────────────────────────

function Thumbnail({ src }: { src: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      style={{
        width: 64, height: 64, borderRadius: 10, flexShrink: 0,
        background: "var(--surface-raised)",
      }}
    />
  );
}

function EventRow({ event }: { event: HostedEvent }) {
  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const location = [venue?.name, venue?.city].filter(Boolean).join(" · ");

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          display: "flex", gap: 12, padding: "12px 0",
          borderBottom: "1px solid var(--border)",
          alignItems: "flex-start", cursor: "pointer",
        }}
      >
        <Thumbnail src={event.image_url} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.5 }}>{formatDate(event.start_at)}</div>
          <div
            style={{
              fontSize: 15, fontWeight: 600, lineHeight: 1.3,
              overflow: "hidden", display: "-webkit-box",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}
          >
            {event.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
            {location && <span>{location}</span>}
            <span>{CATEGORY_LABELS[event.category_primary] ?? event.category_primary}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function EventSection({ title, events }: { title: string; events: HostedEvent[] }) {
  if (events.length === 0) return null;
  return (
    <section>
      <h2
        style={{
          fontSize: 13, fontWeight: 700, letterSpacing: "0.04em",
          textTransform: "uppercase", opacity: 0.45, marginBottom: 4,
        }}
      >
        {title}
        <span
          style={{
            marginLeft: 8, fontSize: 11, fontWeight: 700,
            padding: "2px 7px", borderRadius: 20,
            background: "var(--accent-subtle)", color: "var(--accent)",
          }}
        >
          {events.length}
        </span>
      </h2>
      <div>
        {events.map((e) => <EventRow key={e.id} event={e} />)}
      </div>
    </section>
  );
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ userId: string }>;
}): Promise<Metadata> {
  const { userId } = await params;
  const profile = await fetchProfile(userId);
  if (!profile) return { title: "Profile | Outsy" };
  const name = profile.display_name ?? (profile.username ? `@${profile.username}` : "Outsy member");
  return {
    title: `${name} | Outsy`,
    description: `Events hosted by ${name} on Outsy Montréal`,
    openGraph: {
      title: `${name} | Outsy`,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : [],
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const profile = await fetchProfile(userId);
  if (!profile) notFound();

  const [upcoming, past, friendCount] = await Promise.all([
    fetchUpcomingEvents(userId),
    fetchPastEvents(userId),
    fetchFriendCount(userId),
  ]);

  const displayName = profile.display_name
    ?? (profile.username ? `@${profile.username}` : "Outsy member");
  const hasEvents = upcoming.length > 0 || past.length > 0;
  const totalEvents = upcoming.length + past.length;

  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        minHeight: "100dvh",
        display: "grid",
        gap: 36,
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* ── Identity block ── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8, position: "relative" }}>

        {/* Back button — top-left, liquid-glass */}
        <BackButton
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-strong)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            cursor: "pointer",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          } as React.CSSProperties}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </BackButton>

        {/* Avatar */}
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            style={{
              width: 96, height: 96, borderRadius: "50%",
              objectFit: "cover", display: "block",
              border: "2px solid var(--border-medium)",
            }}
          />
        ) : (
          <div
            style={{
              width: 96, height: 96, borderRadius: "50%",
              background: getAvatarColor(displayName),
              display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 32, fontWeight: 700,
              color: "#fff", userSelect: "none",
              border: "2px solid var(--border-medium)",
            }}
          >
            {getInitials(displayName)}
          </div>
        )}

        {/* Name + username */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {displayName}
          </div>
          {profile.username && (
            <div style={{ fontSize: 14, opacity: 0.5, marginTop: 4 }}>@{profile.username}</div>
          )}
        </div>

        {/* Friend / Message actions */}
        <FriendshipButton profileId={userId} profileUsername={profile.username} />

        {/* Summary counters — same card structure as own profile */}
        <div
          style={{
            display: "flex",
            width: "100%",
            maxWidth: 300,
            marginTop: 8,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px" }}>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{friendCount}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Friends</span>
          </div>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px" }}>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>0</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Following</span>
          </div>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px" }}>
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{totalEvents}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Events</span>
          </div>
        </div>
      </section>

      {/* ── Events ── */}
      {hasEvents ? (
        <div style={{ display: "grid", gap: 28 }}>
          <EventSection title="Upcoming" events={upcoming} />
          <EventSection title="Past events" events={past} />
        </div>
      ) : (
        <p style={{ fontSize: 14, opacity: 0.5 }}>No public events yet.</p>
      )}
    </main>
  );
}

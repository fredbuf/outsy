/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { FriendshipButton } from "./FriendshipButton";

// ── DB queries ────────────────────────────────────────────────────────────────

const fetchProfile = cache(async (userId: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,username")
    .eq("id", userId)
    .maybeSingle();
  return data;
});

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

  const [upcoming, past] = await Promise.all([
    fetchUpcomingEvents(userId),
    fetchPastEvents(userId),
  ]);

  const displayName = profile.display_name
    ?? (profile.username ? `@${profile.username}` : "Outsy member");
  const hasEvents = upcoming.length > 0 || past.length > 0;

  return (
    <main
      className="page-main"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "24px 16px 56px",
        display: "grid",
        gap: 28,
      }}
    >
      <Link href="/events" style={{ opacity: 0.55, fontSize: 14, textDecoration: "none" }}>
        ← Back
      </Link>

      {/* ── Profile header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {profile.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt={displayName}
            style={{
              width: 72, height: 72, borderRadius: "50%",
              objectFit: "cover", flexShrink: 0,
              border: "2px solid var(--border-medium)",
            }}
          />
        ) : (
          <div
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: getAvatarColor(displayName),
              flexShrink: 0, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 24, fontWeight: 700,
              color: "#fff", userSelect: "none",
            }}
          >
            {getInitials(displayName)}
          </div>
        )}

        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{displayName}</h1>
          {profile.username && (
            <span style={{ fontSize: 13, opacity: 0.45 }}>@{profile.username}</span>
          )}
          {/* Client island: shows Add friend / Request sent / Accept / Friends / Message */}
          <FriendshipButton profileId={userId} profileUsername={profile.username} />
        </div>
      </div>

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

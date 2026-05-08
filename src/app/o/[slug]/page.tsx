/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/events/[id]/BackButton";
import { OrgProfileClient } from "./OrgProfileClient";
import { OrgFollowsClient } from "@/app/components/OrgFollowsClient";

// ── Types ─────────────────────────────────────────────────────────────────────

type Organizer = {
  id: string;
  name: string;
  type: string;
  slug: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  image_url: string | null;
  custom_image_url: string | null;
};

type OrgEvent = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  image_url: string | null;
  venues: { name: string; city: string | null } | { name: string; city: string | null }[] | null;
};

// ── DB queries ────────────────────────────────────────────────────────────────

const fetchOrganizer = cache(async (slug: string): Promise<Organizer | null> => {
  const { data } = await supabaseServer()
    .from("organizers")
    .select("id,name,type,slug,bio,website_url,instagram_url,tiktok_url,youtube_url,image_url,custom_image_url")
    .eq("slug", slug)
    .maybeSingle();
  return data as Organizer | null;
});

async function fetchOrgHandle(organizerId: string): Promise<string | null> {
  const { data } = await supabaseServer()
    .from("handles")
    .select("handle")
    .eq("owner_type", "organizer")
    .eq("owner_id", organizerId)
    .maybeSingle();
  return data?.handle ?? null;
}

async function fetchFollowerCount(organizerId: string): Promise<number> {
  const [{ count: userCount }, { count: orgCount }] = await Promise.all([
    supabaseServer()
      .from("organizer_followers")
      .select("*", { count: "exact", head: true })
      .eq("organizer_id", organizerId),
    supabaseServer()
      .from("organizer_follows")
      .select("*", { count: "exact", head: true })
      .eq("followed_organizer_id", organizerId),
  ]);
  return (userCount ?? 0) + (orgCount ?? 0);
}

async function fetchOrgFollowingCount(organizerId: string): Promise<number> {
  const { count } = await supabaseServer()
    .from("organizer_follows")
    .select("*", { count: "exact", head: true })
    .eq("follower_organizer_id", organizerId);
  return count ?? 0;
}

async function fetchOrganizerEvents(organizerId: string): Promise<OrgEvent[]> {
  // Step 1: collect all event IDs linked to this organizer.
  const { data: links } = await supabaseServer()
    .from("event_organizers")
    .select("event_id")
    .eq("organizer_id", organizerId);

  const eventIds = (links ?? []).map((l) => l.event_id as string);
  if (eventIds.length === 0) return [];

  // Step 2: fetch those events with standard public visibility filters.
  // Includes `unlisted` so organizer pages show the full picture even for
  // events intentionally excluded from the main discovery feed.
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,image_url,venues(name,city)")
    .in("id", eventIds)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .in("visibility", ["public", "unlisted"])
    .order("start_at", { ascending: true })
    .limit(40);

  return (data ?? []) as OrgEvent[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  promoter: "Promoter",
  artist: "Artist",
  business: "Business",
  festival: "Festival",
  collective: "Collective",
  brand: "Brand",
  nonprofit: "Non-profit",
  school: "School",
  other: "Organizer",
};


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

// ── Sub-components ────────────────────────────────────────────────────────────

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
      style={{ width: 64, height: 64, borderRadius: 10, flexShrink: 0, background: "var(--surface-raised)" }}
    />
  );
}

function EventRow({ event }: { event: OrgEvent }) {
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

function EventSection({ title, events }: { title: string; events: OrgEvent[] }) {
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
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const organizer = await fetchOrganizer(slug);
  if (!organizer) return { title: "Organizer not found | Outsy" };
  const typeLabel = TYPE_LABELS[organizer.type] ?? "Organizer";
  return {
    title: `${organizer.name} | Outsy`,
    description: organizer.bio ?? `${organizer.name} — ${typeLabel} on Outsy Montréal`,
    openGraph: {
      title: `${organizer.name} | Outsy`,
      images: organizer.image_url ? [{ url: organizer.image_url }] : [],
    },
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const organizer = await fetchOrganizer(slug);
  if (!organizer) notFound();

  const [events, followerCount, orgFollowingCount, orgHandle] = await Promise.all([
    fetchOrganizerEvents(organizer.id),
    fetchFollowerCount(organizer.id),
    fetchOrgFollowingCount(organizer.id),
    fetchOrgHandle(organizer.id),
  ]);

  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.start_at >= now);
  // Fetched ascending; reverse the past slice so newest appears first.
  const past = events.filter((e) => e.start_at < now).reverse();

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

      {/* ── Identity block ─────────────────────────────────────────────────── */}
      <section
        style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 0, paddingTop: 8, position: "relative",
        }}
      >
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

        {/* OrgProfileClient: renders logo overlap, glass card (via children), action buttons, settings */}
        <OrgProfileClient
          organizerId={organizer.id}
          organizerName={organizer.name}
          organizerSlug={organizer.slug ?? null}
          organizerCustomImageUrl={organizer.custom_image_url}
        >
          {/* ── Glass card contents ── */}

          {/* Name */}
          <div style={{ fontSize: 30, fontWeight: 800, color: "#FFFFFF", letterSpacing: "-0.025em", lineHeight: 1.1, textAlign: "center" }}>
            {organizer.name}
          </div>

          {/* Handle */}
          {orgHandle && (
            <div style={{ fontSize: 12, fontWeight: 400, color: "#8C98A8", letterSpacing: "0.01em" }}>
              @{orgHandle}
            </div>
          )}

          {/* Bio */}
          {organizer.bio && (
            <p style={{ fontSize: 13, fontWeight: 500, color: "#8C98A8", textAlign: "center", margin: "6px 0 0", lineHeight: 1.6, maxWidth: 260 }}>
              {organizer.bio}
            </p>
          )}

          {/* Social pills */}
          {(organizer.website_url || organizer.instagram_url || organizer.tiktok_url || organizer.youtube_url) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
              {organizer.website_url && (
                <a
                  href={organizer.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 500, color: "#C7D0DB",
                    padding: "5px 12px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    textDecoration: "none",
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  Website
                </a>
              )}
              {organizer.instagram_url && (
                <a
                  href={organizer.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 500, color: "#C7D0DB",
                    padding: "5px 12px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    textDecoration: "none",
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                  Instagram
                </a>
              )}
              {organizer.tiktok_url && (
                <a
                  href={organizer.tiktok_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 500, color: "#C7D0DB",
                    padding: "5px 12px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    textDecoration: "none",
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                  </svg>
                  TikTok
                </a>
              )}
              {organizer.youtube_url && (
                <a
                  href={organizer.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    fontSize: 11, fontWeight: 500, color: "#C7D0DB",
                    padding: "5px 12px", borderRadius: 999,
                    background: "rgba(255,255,255,0.07)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    textDecoration: "none",
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
                    <polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
                  </svg>
                  YouTube
                </a>
              )}
            </div>
          )}

          {/* Stats — clickable Followers / Following / Events sheets */}
          <OrgFollowsClient
            organizerId={organizer.id}
            followerCount={followerCount}
            orgFollowingCount={orgFollowingCount}
            eventCount={events.length}
            events={events}
          />
        </OrgProfileClient>
      </section>

      {/* ── Events ─────────────────────────────────────────────────────────── */}
      {events.length > 0 ? (
        <div style={{ display: "grid", gap: 28 }}>
          <EventSection title="Upcoming" events={upcoming} />
          <EventSection title="Past events" events={past} />
        </div>
      ) : (
        <p style={{ fontSize: 14, opacity: 0.5, textAlign: "center", margin: 0 }}>
          No public events yet.
        </p>
      )}
    </main>
  );
}

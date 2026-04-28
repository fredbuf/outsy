/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { BackButton } from "@/app/events/[id]/BackButton";

// ── Types ─────────────────────────────────────────────────────────────────────

type Organizer = {
  id: string;
  name: string;
  type: string;
  bio: string | null;
  website_url: string | null;
  instagram_url: string | null;
  image_url: string | null;
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
    .select("id,name,type,bio,website_url,instagram_url,image_url")
    .eq("slug", slug)
    .maybeSingle();
  return data as Organizer | null;
});

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
  festival: "Festival",
  collective: "Collective",
  brand: "Brand",
  other: "Organizer",
};

// Muted dark colours — these sit behind white initials on the dark app theme.
const LOGO_COLORS = [
  "#1e3a5f", "#2d4a1e", "#4a1e2d",
  "#1e2d4a", "#3a2d1e", "#1e4a3a",
];

function getLogoColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[hash % LOGO_COLORS.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
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

  const events = await fetchOrganizerEvents(organizer.id);

  const now = new Date().toISOString();
  const upcoming = events.filter((e) => e.start_at >= now);
  // Fetched ascending; reverse the past slice so newest appears first.
  const past = events.filter((e) => e.start_at < now).reverse();

  const typeLabel = TYPE_LABELS[organizer.type] ?? "Organizer";
  const hasLinks = organizer.website_url || organizer.instagram_url;

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
          gap: 12, paddingTop: 8, position: "relative",
        }}
      >
        {/* Back button */}
        <BackButton
          style={{
            position: "absolute", top: 0, left: 0,
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-strong)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            cursor: "pointer", color: "inherit",
            display: "flex", alignItems: "center", justifyContent: "center",
          } as React.CSSProperties}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </BackButton>

        {/* Logo — rounded square to distinguish from circular user avatars */}
        <div style={{ width: 96, height: 96, flexShrink: 0 }}>
          {organizer.image_url ? (
            <img
              src={organizer.image_url}
              alt={organizer.name}
              style={{
                width: 96, height: 96, borderRadius: 20,
                objectFit: "cover", display: "block",
                border: "1.5px solid var(--border-strong)",
              }}
            />
          ) : (
            <div
              style={{
                width: 96, height: 96, borderRadius: 20,
                background: getLogoColor(organizer.name),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em",
                color: "rgba(255,255,255,0.85)", userSelect: "none",
                border: "1.5px solid var(--border-strong)",
              }}
            >
              {getInitials(organizer.name)}
            </div>
          )}
        </div>

        {/* Name + type badge */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {organizer.name}
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <span
              style={{
                fontSize: 11, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.06em",
                padding: "3px 10px", borderRadius: 20,
                background: "var(--surface-raised)",
                border: "1px solid var(--border-medium)",
                color: "var(--accent)",
              }}
            >
              {typeLabel}
            </span>
          </div>
        </div>

        {/* Bio */}
        {organizer.bio && (
          <p
            style={{
              fontSize: 14, lineHeight: 1.6, textAlign: "center",
              opacity: 0.7, maxWidth: 380, margin: 0,
            }}
          >
            {organizer.bio}
          </p>
        )}

        {/* External links */}
        {hasLinks && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
            {organizer.website_url && (
              <a
                href={organizer.website_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 13, fontWeight: 500,
                  padding: "6px 14px", borderRadius: 20,
                  background: "var(--btn-bg)",
                  border: "1px solid var(--border-strong)",
                  color: "inherit", textDecoration: "none",
                }}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
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
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 13, fontWeight: 500,
                  padding: "6px 14px", borderRadius: 20,
                  background: "var(--btn-bg)",
                  border: "1px solid var(--border-strong)",
                  color: "inherit", textDecoration: "none",
                }}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                Instagram
              </a>
            )}
          </div>
        )}
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

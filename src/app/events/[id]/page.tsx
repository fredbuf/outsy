/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { CopyInviteLink } from "./CopyInviteLink";
import { RsvpPanel } from "./RsvpPanel";
import { AttendeeList } from "./AttendeeList";
import { EventOwnerActions } from "./EventOwnerActions";
import { StarButton } from "./StarButton";

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,start_at,end_at,category_primary,status,min_price,max_price,currency,image_url,source_url,source,visibility,creator_id,profiles!creator_id(display_name,avatar_url,username),venues(name,address_line1,city)"
    )
    .eq("id", id)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .in("status", ["scheduled", "announced"])
    .maybeSingle();
  return data;
});

async function fetchRelated(id: string, category: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,min_price,max_price,currency,image_url,source_url,venues(name,city)")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .eq("visibility", "public")
    .eq("category_primary", category)
    .neq("id", id)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(6);
  return data ?? [];
}

async function fetchRsvpCounts(eventId: string) {
  const { data } = await supabaseServer()
    .from("rsvps")
    .select("response")
    .eq("event_id", eventId);

  const counts = { going: 0, maybe: 0, cant_go: 0 };
  for (const row of data ?? []) {
    if (row.response === "going") counts.going++;
    else if (row.response === "maybe") counts.maybe++;
    else if (row.response === "cant_go") counts.cant_go++;
  }
  return counts;
}

type Attendee = { display_name: string | null; avatar_url: string | null };

async function fetchAttendees(eventId: string): Promise<Attendee[]> {
  const { data } = await supabaseServer()
    .from("rsvps")
    .select("profiles(display_name, avatar_url)")
    .eq("event_id", eventId)
    .eq("response", "going")
    .order("updated_at", { ascending: false })
    .limit(5);

  return (data ?? [])
    .map((r) => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      return p as Attendee | null;
    })
    .filter((p): p is Attendee => p !== null);
}

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) return { title: "Event not found | Outsy" };
  const description =
    event.description ?? `${event.category_primary} event in Montréal`;
  return {
    title: `${event.title} | Outsy`,
    description,
    openGraph: {
      title: event.title,
      description,
      images: event.image_url ? [{ url: event.image_url }] : [],
    },
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  concerts:     "Concerts",
  nightlife:    "Nightlife",
  arts_culture: "Arts & Culture",
  comedy:       "Comedy",
  sports:       "Sports",
  family:       "Family",
  // legacy values still in DB until re-ingestion
  music:        "Concerts",
  art:          "Arts & Culture",
};

const SOURCE_LABELS: Record<string, string> = {
  ticketmaster:     "Ticketmaster",
  eventbrite:       "Eventbrite",
  manual:           "Community",
  venue_newcitygas: "New City Gas",
  venue_sat:        "SAT Montréal",
};

function formatDateFull(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // Hide time when it's midnight (TM events with no explicit time)
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  return isUnknownTime ? datePart : `${datePart} · ${timePart}`;
}

// Matches feed card smartDate — compact, context-aware label
function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const toKey = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const eventDay = toKey(d);
  const today = toKey(now);
  const tomorrow = toKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const timeStr = isUnknownTime ? "" : " at " + rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();
  if (eventDay === today) return `Today${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow${timeStr}`;
  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    const weekday = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "long" });
    return `${weekday}${timeStr}`;
  }
  const monthDay = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" });
  return `${monthDay}${timeStr}`;
}

// Matches feed card categoryBg gradient palette
function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts":     case "music":  return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":                   return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": case "art":    return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":                      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":                      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":                      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:                            return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

// Split "Series Name - Edition" into two display lines
function splitSeriesTitle(title: string): { series: string; edition: string | null } {
  const seps = [" - ", " – ", " | ", " : ", " with ", " feat. ", " ft. ", " featuring "];
  const lower = title.toLowerCase();
  for (const sep of seps) {
    const idx = lower.indexOf(sep);
    if (idx > 0) {
      return { series: title.slice(0, idx).trim(), edition: title.slice(idx + sep.length).trim() || null };
    }
  }
  return { series: title, edition: null };
}

function formatPrice(
  min: number | null,
  max: number | null,
  currency: string | null
): string | null {
  const c = currency ?? "CAD";
  if (min === 0) return "Free";
  if (min !== null) {
    if (max !== null && max !== min) return `${c} ${min} – ${max}`;
    return `${c} ${min}`;
  }
  return null;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const eastern = new Date(d.toLocaleString("en-US", { timeZone: "America/Toronto" }));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${eastern.getFullYear()}-${pad(eastern.getMonth() + 1)}-${pad(eastern.getDate())}T${pad(eastern.getHours())}:${pad(eastern.getMinutes())}`;
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await fetchEvent(id);
  if (!event) notFound();

  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const creatorRaw = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
  const creator = creatorRaw as { display_name: string | null; avatar_url: string | null; username: string | null } | null;
  const [related, rsvpCounts, attendees] = await Promise.all([
    fetchRelated(id, event.category_primary),
    fetchRsvpCounts(id),
    fetchAttendees(id),
  ]);

  const price = formatPrice(event.min_price, event.max_price, event.currency);
  const isAnnounced = (event as { status?: string }).status === "announced";

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 56px",
        display: "grid",
        gap: 28,
      }}
    >
      {/* Back */}
      <Link
        href="/events"
        style={{ opacity: 0.55, fontSize: 14, textDecoration: "none" }}
      >
        ← Back to events
      </Link>

      {/* Hero image with gradient overlay */}
      {event.image_url && (
        <div style={{ position: "relative", borderRadius: 16, overflow: "hidden" }}>
          <img
            src={event.image_url}
            alt={event.title}
            style={{
              width: "100%",
              maxHeight: 400,
              objectFit: "cover",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "55%",
              background: "linear-gradient(to top, rgba(0,0,0,0.52), transparent)",
              pointerEvents: "none",
            }}
          />
        </div>
      )}

      {/* Title + metadata block */}
      <div style={{ display: "grid", gap: 14 }}>
        {/* Category + price + announced badge */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              opacity: 0.5,
              textTransform: "uppercase",
              letterSpacing: "0.07em",
            }}
          >
            {CATEGORY_LABELS[event.category_primary] ?? event.category_primary}
          </span>
          {price && (
            <span style={{ fontSize: 11, opacity: 0.4 }}>· {price}</span>
          )}
          {isAnnounced && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 20,
                border: "1px solid var(--border-strong)",
                opacity: 0.7,
              }}
            >
              Tickets soon
            </span>
          )}
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.01em",
          }}
        >
          {event.title}
        </h1>

        {/* Venue */}
        {venue?.name && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 15,
            }}
          >
            <span style={{ opacity: 0.4, flexShrink: 0, marginTop: 1 }}>📍</span>
            <span style={{ opacity: 0.8 }}>
              {venue.name}
              {venue.city ? `, ${venue.city}` : ""}
            </span>
          </div>
        )}

        {/* Date */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 15,
          }}
        >
          <span style={{ opacity: 0.4, flexShrink: 0, marginTop: 1 }}>🗓</span>
          <span style={{ opacity: 0.8 }}>{formatDateFull(event.start_at)}</span>
        </div>

        {/* Host */}
        {creator && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {creator.avatar_url ? (
              <img
                src={creator.avatar_url}
                alt={creator.display_name ?? ""}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: getAvatarColor(creator.display_name),
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 700,
                  color: "#fff",
                  userSelect: "none",
                }}
              >
                {getInitials(creator.display_name)}
              </div>
            )}
            {creator.username ? (
              <Link
                href={`/u/${creator.username}`}
                style={{ opacity: 0.65, fontSize: 14, textDecoration: "underline" }}
              >
                Hosted by {creator.display_name ?? `@${creator.username}`}
              </Link>
            ) : (
              <span style={{ opacity: 0.65, fontSize: 14 }}>
                Hosted by {creator.display_name ?? "a member"}
              </span>
            )}
          </div>
        )}

        {/* Source attribution */}
        {event.source && (
          <span style={{ opacity: 0.35, fontSize: 11 }}>
            via {SOURCE_LABELS[event.source] ?? event.source}
          </span>
        )}
      </div>

      {/* Action bar: Save · Share · Owner actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <StarButton eventId={id} />
        <CopyInviteLink
          title={event.title}
          visibility={event.visibility as "public" | "private"}
        />
        <EventOwnerActions
          eventId={id}
          creatorId={(event as { creator_id?: string | null }).creator_id ?? null}
          source={event.source}
          eventData={{
            title: event.title,
            description: event.description ?? "",
            startAt: toDatetimeLocal(event.start_at),
            endAt: toDatetimeLocal(event.end_at ?? null),
            category: (event.category_primary as "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family") ?? "concerts",
            venueName: venue?.name ?? "",
            venueAddress: venue?.address_line1 ?? "",
            venueCity: venue?.city ?? "Montréal",
            sourceUrl: event.source_url ?? "",
            visibility: (event.visibility as "public" | "private") ?? "public",
            address: event.visibility === "private"
              ? (venue?.address_line1 ?? venue?.name ?? "")
              : "",
            imageUrl: event.image_url ?? null,
          }}
        />
      </div>

      {/* Primary CTA */}
      {event.source_url && (
        <a
          href={event.source_url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            padding: "15px 24px",
            borderRadius: 14,
            background: "var(--btn-bg)",
            border: "1px solid var(--border-strong)",
            fontWeight: 700,
            fontSize: 16,
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Get tickets →
        </a>
      )}

      {/* RSVP */}
      <RsvpPanel
        eventId={id}
        initialCounts={rsvpCounts}
        visibility={event.visibility as "public" | "private"}
      />

      {/* Social proof */}
      {(rsvpCounts.going > 0 || rsvpCounts.maybe > 0) && (
        <AttendeeList
          eventId={id}
          initialAttendees={attendees}
          goingCount={rsvpCounts.going}
          maybeCount={rsvpCounts.maybe}
        />
      )}

      {/* Description */}
      {event.description && (
        <div style={{ display: "grid", gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, opacity: 0.55 }}>
            About this event
          </h2>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.75,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
            }}
          >
            {event.description}
          </p>
        </div>
      )}

      {/* Related events — horizontal scroll, feed-card style */}
      {related.length > 0 && (
        <section style={{ display: "grid", gap: 10, paddingTop: 4 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>More events like this</h2>
          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              scrollbarWidth: "none",
              paddingBottom: 4,
            }}
          >
            {related.map((r) => {
              const rVenue = Array.isArray(r.venues) ? r.venues[0] : r.venues;
              const { series, edition } = splitSeriesTitle(r.title);
              return (
                <Link
                  key={r.id}
                  href={`/events/${r.id}`}
                  style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: 190,
                      height: 220,
                      borderRadius: 12,
                      overflow: "hidden",
                      background: categoryBg(r.category_primary),
                    }}
                  >
                    {r.image_url && (
                      <img
                        src={r.image_url}
                        alt=""
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    )}
                    {/* Gradient overlay */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)",
                      }}
                    />
                    {/* Text overlay */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        padding: "8px 10px 11px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                        {smartDate(r.start_at)}
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#fff",
                          lineHeight: 1.25,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: edition ? 1 : 2,
                          WebkitBoxOrient: "vertical",
                        }}
                      >
                        {series}
                      </div>
                      {edition && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "rgba(255,255,255,0.65)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {edition}
                        </div>
                      )}
                      {rVenue?.name && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "rgba(255,255,255,0.5)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rVenue.city ? `${rVenue.name}, ${rVenue.city}` : rVenue.name}
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

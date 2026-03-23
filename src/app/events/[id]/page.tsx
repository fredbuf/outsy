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

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,start_at,end_at,category_primary,min_price,max_price,currency,image_url,source_url,source,visibility,creator_id,profiles!creator_id(display_name,avatar_url,username),venues(name,address_line1,city)"
    )
    .eq("id", id)
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .maybeSingle();
  return data;
});

async function fetchRelated(id: string, category: string) {
  const { data } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,category_primary,min_price,max_price,currency,image_url,source_url")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("status", "scheduled")
    .eq("visibility", "public")
    .eq("category_primary", category)
    .neq("id", id)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(4);
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

const SOURCE_LABELS: Record<string, string> = {
  ticketmaster:     "Ticketmaster",
  eventbrite:       "Eventbrite",
  manual:           "Community",
  venue_newcitygas: "New City Gas",
  venue_sat:        "SAT Montréal",
};

function formatDateCompact(iso: string): string {
  const d = new Date(iso);
  const datePart = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart} · ${timePart}`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  // Convert to Eastern time for datetime-local input (which treats values as local)
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

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 48px",
        display: "grid",
        gap: 24,
      }}
    >
      <Link
        href="/events"
        style={{ opacity: 0.6, fontSize: 14, textDecoration: "none" }}
      >
        ← Back to events
      </Link>

      {event.image_url && (
        <img
          src={event.image_url}
          alt={event.title}
          style={{
            width: "100%",
            maxHeight: 380,
            objectFit: "cover",
            borderRadius: 16,
          }}
        />
      )}

      <div style={{ display: "grid", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
          {event.title}
        </h1>

        <div style={{ display: "grid", gap: 5, fontSize: 14 }}>
          <span style={{ opacity: 0.85 }}>{formatDateCompact(event.start_at)}</span>

          {venue?.name && (
            <span style={{ opacity: 0.75 }}>
              {venue.name}
              {venue.city ? `, ${venue.city}` : ""}
            </span>
          )}

          <span style={{ opacity: 0.75, textTransform: "capitalize" }}>
            {event.category_primary}
            {formatPrice(event.min_price, event.max_price, event.currency)
              ? ` · ${formatPrice(event.min_price, event.max_price, event.currency)}`
              : ""}
          </span>

          {event.source && (
            <span style={{ opacity: 0.45, fontSize: 12 }}>
              via {SOURCE_LABELS[event.source] ?? event.source}
            </span>
          )}

          {creator && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2 }}>
              {creator.avatar_url ? (
                <img
                  src={creator.avatar_url}
                  alt={creator.display_name ?? ""}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    objectFit: "cover",
                    flex: "0 0 auto",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: getAvatarColor(creator.display_name),
                    flex: "0 0 auto",
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
                  style={{ opacity: 0.6, fontSize: 13, textDecoration: "underline" }}
                >
                  Hosted by {creator.display_name ?? `@${creator.username}`}
                </Link>
              ) : (
                <span style={{ opacity: 0.6, fontSize: 13 }}>
                  Hosted by {creator.display_name ?? "a member"}
                </span>
              )}
            </div>
          )}
        </div>

        <CopyInviteLink title={event.title} visibility={event.visibility as "public" | "private"} />

        <EventOwnerActions
          eventId={id}
          creatorId={(event as { creator_id?: string | null }).creator_id ?? null}
          source={event.source}
          eventData={{
            title: event.title,
            description: event.description ?? "",
            startAt: toDatetimeLocal(event.start_at),
            endAt: toDatetimeLocal(event.end_at ?? null),
            category: (event.category_primary as "music" | "nightlife" | "art") ?? "music",
            venueName: venue?.name ?? "",
            venueAddress: venue?.address_line1 ?? "",
            venueCity: venue?.city ?? "Montréal",
            sourceUrl: event.source_url ?? "",
            visibility: (event.visibility as "public" | "private") ?? "public",
            imageUrl: event.image_url ?? null,
          }}
        />

        {event.source_url && (
          <a
            href={event.source_url}
            target="_blank"
            rel="noreferrer"
            className="cta-full-mobile"
            style={{
              display: "inline-block",
              alignSelf: "start",
              marginTop: 4,
              padding: "12px 28px",
              borderRadius: 12,
              background: "var(--btn-bg)",
              border: "1px solid var(--border-strong)",
              fontWeight: 700,
              fontSize: 15,
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            Get tickets →
          </a>
        )}
      </div>

      {event.description && (
        <div style={{ display: "grid", gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, opacity: 0.6 }}>
            About this event
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.75,
              opacity: 0.85,
              whiteSpace: "pre-wrap",
            }}
          >
            {event.description}
          </p>
        </div>
      )}

      {(rsvpCounts.going > 0 || rsvpCounts.maybe > 0) && (
        <AttendeeList
          eventId={id}
          initialAttendees={attendees}
          goingCount={rsvpCounts.going}
          maybeCount={rsvpCounts.maybe}
        />
      )}

      <RsvpPanel eventId={id} initialCounts={rsvpCounts} visibility={event.visibility as "public" | "private"} />

      {related.length > 0 && (
        <section style={{ display: "grid", gap: 12, paddingTop: 8 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>More events like this</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {related.map((r) => {
              const price = formatPrice(r.min_price, r.max_price, r.currency);
              const priceLabel = price ?? (r.source_url ? "🎟 Tickets available" : null);
              return (
                <Link
                  key={r.id}
                  href={`/events/${r.id}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <article
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                      padding: 14,
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt=""
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: "cover",
                          borderRadius: 10,
                          flex: "0 0 auto",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: 10,
                          background: "var(--surface-subtle)",
                          flex: "0 0 auto",
                        }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>{formatDateShort(r.start_at)}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                        {r.title}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {r.category_primary}
                        {priceLabel ? ` · ${priceLabel}` : ""}
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

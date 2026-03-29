/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScheduleEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  visibility: "public" | "private";
  source_url: string | null;
  source: string;
  response: "going" | "maybe";
  venue_name: string | null;
  venue_city: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const TZ = "America/Toronto";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateHeading(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tz = TZ;

  const todayStr    = now.toLocaleDateString("en-CA", { timeZone: tz });
  const tomorrowD   = new Date(now);
  tomorrowD.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrowD.toLocaleDateString("en-CA", { timeZone: tz });
  const eventStr    = d.toLocaleDateString("en-CA", { timeZone: tz });

  if (eventStr === todayStr)    return "Today";
  if (eventStr === tomorrowStr) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });
}

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

// Groups sorted events into [{ heading, dateStr, events }] sections
function groupByDate(events: ScheduleEvent[]) {
  const sections: { heading: string; dateStr: string; events: ScheduleEvent[] }[] = [];
  for (const e of events) {
    const key = dateKey(e.start_at);
    const last = sections.at(-1);
    if (last && last.dateStr === key) {
      last.events.push(e);
    } else {
      sections.push({ heading: formatDateHeading(e.start_at), dateStr: key, events: [e] });
    }
  }
  return sections;
}

// ── Small icons ────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ── Event row card ─────────────────────────────────────────────────────────────

function EventRow({ event }: { event: ScheduleEvent }) {
  const isPrivate = event.visibility === "private";
  const isGoing   = event.response === "going";
  const location  = [event.venue_name, event.venue_city].filter(Boolean).join(" · ");

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          padding: "12px 0",
          borderBottom: "1px solid var(--border)",
          alignItems: "flex-start",
          cursor: "pointer",
        }}
      >
        {/* Thumbnail */}
        <div style={{ flexShrink: 0 }}>
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 10,
                background: "var(--surface-raised)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 0.4,
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
          )}
        </div>

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>
          {/* Badges row */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {/* RSVP badge */}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.02em",
                padding: "2px 6px",
                borderRadius: 20,
                background: isGoing ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color:      isGoing ? "#10b981"               : "#f59e0b",
                border:     `1px solid ${isGoing ? "rgba(16,185,129,0.20)" : "rgba(245,158,11,0.20)"}`,
              }}
            >
              {isGoing ? <CheckIcon /> : <StarIcon />}
              {isGoing ? "Going" : "Interested"}
            </span>

            {/* Private badge */}
            {isPrivate && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                  padding: "2px 6px",
                  borderRadius: 20,
                  background: "rgba(124,58,237,0.10)",
                  color: "var(--accent)",
                  border: "1px solid rgba(124,58,237,0.15)",
                }}
              >
                Private
              </span>
            )}
          </div>

          {/* Title */}
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              lineHeight: 1.3,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {event.title}
          </div>

          {/* Time + location */}
          <div style={{ fontSize: 12, opacity: 0.55, display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
            <span>{formatTime(event.start_at)}</span>
            {location && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <PinIcon />
                {location}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user, loading: authLoading } = useAuth();
  const [events, setEvents]     = useState<ScheduleEvent[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true);

    // Query the user's RSVPs, join events + venues.
    // We only include: going / maybe responses, upcoming events that are approved.
    supabaseBrowser()
      .from("rsvps")
      .select(
        "response, events(id, title, start_at, image_url, visibility, source_url, source, venues(name, city))"
      )
      .eq("user_id", user.id)
      .in("response", ["going", "maybe"])
      .order("events(start_at)", { ascending: true })
      .then(({ data }) => {
        const now = new Date().toISOString();
        const rows: ScheduleEvent[] = [];

        for (const row of data ?? []) {
          // PostgREST returns the join as an object or array — normalise
          const ev = Array.isArray(row.events) ? row.events[0] : row.events;
          if (!ev) continue;

          // Skip past events (client-side guard)
          if (ev.start_at < now) continue;

          const venue = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
          rows.push({
            id:         ev.id,
            title:      ev.title,
            start_at:   ev.start_at,
            image_url:  ev.image_url,
            visibility: ev.visibility as "public" | "private",
            source_url: ev.source_url ?? null,
            source:     ev.source,
            response:   row.response as "going" | "maybe",
            venue_name: venue?.name ?? null,
            venue_city: venue?.city ?? null,
          });
        }

        // Ensure ascending start_at order (server ordering on joined col may vary)
        rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
        setEvents(rows);
        setFetching(false);
      });
  }, [user]);

  // ── Auth loading skeleton ──────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main className="page-main" style={{ padding: "24px 20px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ height: 32, width: 120, borderRadius: 8, background: "var(--surface-raised)", marginBottom: 24 }} />
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 64, height: 64, borderRadius: 10, background: "var(--surface-raised)", flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ height: 12, width: "60%", borderRadius: 6, background: "var(--surface-raised)" }} />
              <div style={{ height: 14, width: "85%", borderRadius: 6, background: "var(--surface-raised)" }} />
              <div style={{ height: 11, width: "40%", borderRadius: 6, background: "var(--surface-raised)" }} />
            </div>
          </div>
        ))}
      </main>
    );
  }

  // ── Signed-out gate ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="page-main" style={{ padding: "48px 20px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.2 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Your schedule</h1>
        <p style={{ fontSize: 15, opacity: 0.55, marginBottom: 24, lineHeight: 1.6 }}>
          Sign in to see all your upcoming events in one place.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            padding: "10px 24px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  const sections = groupByDate(events);

  return (
    <main
      className="page-main"
      style={{ padding: "24px 20px 48px", maxWidth: 600, margin: "0 auto" }}
    >
      {/* Page heading */}
      <header style={{ marginBottom: 24 }}>
        <h1 className="page-h1" style={{ fontSize: 28, fontWeight: 700 }}>
          Schedule
        </h1>
        <p style={{ fontSize: 14, opacity: 0.5, marginTop: 4 }}>
          Your upcoming events
        </p>
      </header>

      {/* Loading state */}
      {fetching && (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ width: 64, height: 64, borderRadius: 10, background: "var(--surface-raised)", flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
                <div style={{ height: 12, width: "55%", borderRadius: 6, background: "var(--surface-raised)" }} />
                <div style={{ height: 14, width: "80%", borderRadius: 6, background: "var(--surface-raised)" }} />
                <div style={{ height: 11, width: "38%", borderRadius: 6, background: "var(--surface-raised)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!fetching && events.length === 0 && (
        <div
          style={{
            padding: "48px 24px",
            textAlign: "center",
            borderRadius: 16,
            border: "1px dashed var(--border-strong)",
          }}
        >
          <div style={{ opacity: 0.2, marginBottom: 14 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nothing coming up yet</p>
          <p style={{ fontSize: 14, opacity: 0.5, marginBottom: 20, lineHeight: 1.6 }}>
            Mark yourself as Going or Interested on any event to see it here.
          </p>
          <Link
            href="/events"
            style={{
              display: "inline-block",
              padding: "9px 20px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              background: "var(--btn-bg)",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Explore events
          </Link>
        </div>
      )}

      {/* Event sections grouped by date */}
      {!fetching && sections.length > 0 && (
        <div>
          {sections.map((section) => (
            <section key={section.dateStr} style={{ marginBottom: 28 }}>
              {/* Date heading */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.01em",
                  opacity: 0.45,
                  textTransform: "uppercase",
                  marginBottom: 2,
                  paddingBottom: 6,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {section.heading}
              </div>

              {/* Event rows */}
              {section.events.map((event) => (
                <EventRow key={event.id} event={event} />
              ))}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

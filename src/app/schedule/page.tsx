/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "upcoming" | "hosting" | "calendar";

type AttendingEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  visibility: "public" | "private";
  response: "going" | "maybe";
  venue_name: string | null;
  venue_city: string | null;
};

type HostingEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  visibility: "public" | "private";
  is_approved: boolean;
  status: string;
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
  const d   = new Date(iso);
  const now = new Date();

  const todayStr    = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const tomorrowD   = new Date(now);
  tomorrowD.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrowD.toLocaleDateString("en-CA", { timeZone: TZ });
  const eventStr    = d.toLocaleDateString("en-CA",   { timeZone: TZ });

  if (eventStr === todayStr)    return "Today";
  if (eventStr === tomorrowStr) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    month:   "long",
    day:     "numeric",
  });
}

function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function groupByDate<T extends { start_at: string }>(events: T[]) {
  const sections: { heading: string; dateStr: string; events: T[] }[] = [];
  for (const e of events) {
    const key  = dateKey(e.start_at);
    const last = sections.at(-1);
    if (last && last.dateStr === key) {
      last.events.push(e);
    } else {
      sections.push({ heading: formatDateHeading(e.start_at), dateStr: key, events: [e] });
    }
  }
  return sections;
}

// ── Icons ──────────────────────────────────────────────────────────────────────

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

function CalendarIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8"  y1="2" x2="8"  y2="6" />
      <line x1="3"  y1="10" x2="21" y2="10" />
    </svg>
  );
}

// ── Shared skeleton rows ───────────────────────────────────────────────────────

function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
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
  );
}

// ── Thumbnail ──────────────────────────────────────────────────────────────────

function Thumbnail({ src }: { src: string | null }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", display: "block" }}
      />
    );
  }
  return (
    <div
      style={{
        width: 64,
        height: 64,
        borderRadius: 10,
        background: "var(--surface-raised)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.35,
      }}
    >
      <CalendarIcon size={22} />
    </div>
  );
}

// ── Date-section list ──────────────────────────────────────────────────────────

function DateSections<T extends { start_at: string; id: string }>({
  events,
  renderRow,
}: {
  events: T[];
  renderRow: (event: T) => React.ReactNode;
}) {
  const sections = groupByDate(events);
  return (
    <div>
      {sections.map((section) => (
        <section key={section.dateStr} style={{ marginBottom: 28 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              opacity: 0.4,
              textTransform: "uppercase",
              paddingBottom: 6,
              borderBottom: "1px solid var(--border)",
              marginBottom: 2,
            }}
          >
            {section.heading}
          </div>
          {section.events.map((e) => renderRow(e))}
        </section>
      ))}
    </div>
  );
}

// ── Attending row ──────────────────────────────────────────────────────────────

function AttendingRow({ event }: { event: AttendingEvent }) {
  const isGoing   = event.response === "going";
  const isPrivate = event.visibility === "private";
  const location  = [event.venue_name, event.venue_city].filter(Boolean).join(" · ");

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start", cursor: "pointer" }}>
        <div style={{ flexShrink: 0 }}><Thumbnail src={event.image_url} /></div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                padding: "2px 6px", borderRadius: 20,
                background: isGoing ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color:      isGoing ? "#10b981"               : "#f59e0b",
                border:     `1px solid ${isGoing ? "rgba(16,185,129,0.20)" : "rgba(245,158,11,0.20)"}`,
              }}
            >
              {isGoing ? <CheckIcon /> : <StarIcon />}
              {isGoing ? "Going" : "Interested"}
            </span>
            {isPrivate && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                  padding: "2px 6px", borderRadius: 20,
                  background: "rgba(124,58,237,0.10)", color: "var(--accent)",
                  border: "1px solid rgba(124,58,237,0.15)",
                }}
              >
                Private
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {event.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.55, display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
            <span>{formatTime(event.start_at)}</span>
            {location && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <PinIcon />{location}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Hosting row ────────────────────────────────────────────────────────────────

function HostingRow({ event }: { event: HostingEvent }) {
  const isPrivate = event.visibility === "private";
  const isPending = !event.is_approved;
  const location  = [event.venue_name, event.venue_city].filter(Boolean).join(" · ");

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start", cursor: "pointer" }}>
        <div style={{ flexShrink: 0 }}><Thumbnail src={event.image_url} /></div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {isPending && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                  padding: "2px 6px", borderRadius: 20,
                  background: "rgba(245,158,11,0.12)", color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.20)",
                }}
              >
                Pending review
              </span>
            )}
            {isPrivate && (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                  padding: "2px 6px", borderRadius: 20,
                  background: "rgba(124,58,237,0.10)", color: "var(--accent)",
                  border: "1px solid rgba(124,58,237,0.15)",
                }}
              >
                Private
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {event.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.55, display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
            <span>{formatTime(event.start_at)}</span>
            {location && (
              <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                <PinIcon />{location}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        borderRadius: 16,
        border: "1px dashed var(--border-strong)",
      }}
    >
      <div style={{ opacity: 0.2, marginBottom: 14, display: "flex", justifyContent: "center" }}>
        <CalendarIcon size={40} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{message}</p>
      {cta}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>("upcoming");

  const [attending,        setAttending]        = useState<AttendingEvent[]>([]);
  const [hosting,          setHosting]          = useState<HostingEvent[]>([]);
  const [fetchingAttend,   setFetchingAttend]   = useState(false);
  const [fetchingHosting,  setFetchingHosting]  = useState(false);

  // Fetch events the user is attending (going / maybe RSVPs)
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchingAttend(true);
    supabaseBrowser()
      .from("rsvps")
      .select("response, events(id, title, start_at, image_url, visibility, source_url, source, venues(name, city))")
      .eq("user_id", user.id)
      .in("response", ["going", "maybe"])
      .then(({ data }) => {
        const now  = new Date().toISOString();
        const rows: AttendingEvent[] = [];
        for (const row of data ?? []) {
          const ev = Array.isArray(row.events) ? row.events[0] : row.events;
          if (!ev || ev.start_at < now) continue;
          const venue = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
          rows.push({
            id:         ev.id,
            title:      ev.title,
            start_at:   ev.start_at,
            image_url:  ev.image_url,
            visibility: ev.visibility as "public" | "private",
            response:   row.response as "going" | "maybe",
            venue_name: venue?.name ?? null,
            venue_city: venue?.city ?? null,
          });
        }
        rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
        setAttending(rows);
        setFetchingAttend(false);
      });
  }, [user]);

  // Fetch events the user created
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchingHosting(true);
    supabaseBrowser()
      .from("events")
      .select("id, title, start_at, image_url, visibility, is_approved, status, venues(name, city)")
      .eq("creator_id", user.id)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .then(({ data }) => {
        const rows: HostingEvent[] = (data ?? []).map((ev) => {
          const venue = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
          return {
            id:         ev.id,
            title:      ev.title,
            start_at:   ev.start_at,
            image_url:  ev.image_url,
            visibility: ev.visibility as "public" | "private",
            is_approved: ev.is_approved as boolean,
            status:     ev.status,
            venue_name: venue?.name ?? null,
            venue_city: venue?.city ?? null,
          };
        });
        setHosting(rows);
        setFetchingHosting(false);
      });
  }, [user]);

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main className="page-main" style={{ padding: "24px 20px", maxWidth: 600, margin: "0 auto" }}>
        <div style={{ height: 32, width: 120, borderRadius: 8, background: "var(--surface-raised)", margin: "0 auto 20px" }} />
        <div style={{ height: 40, borderRadius: 12, background: "var(--surface-raised)", marginBottom: 24 }} />
        <SkeletonRows count={3} />
      </main>
    );
  }

  // ── Signed-out gate ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="page-main" style={{ padding: "48px 20px", maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <div style={{ opacity: 0.2, marginBottom: 16, display: "flex", justifyContent: "center" }}>
          <CalendarIcon size={48} />
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

  // ── Tab content ───────────────────────────────────────────────────────────────

  function renderUpcoming() {
    if (fetchingAttend) return <SkeletonRows />;
    if (attending.length === 0) {
      return (
        <EmptyState
          message="Nothing coming up yet"
          cta={
            <p style={{ fontSize: 14, opacity: 0.5, marginBottom: 20, lineHeight: 1.6 }}>
              Mark yourself as Going or Interested on any event to see it here.
              <br />
              <Link
                href="/events"
                style={{
                  display: "inline-block",
                  marginTop: 12,
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
            </p>
          }
        />
      );
    }
    return (
      <DateSections
        events={attending}
        renderRow={(e) => <AttendingRow key={e.id} event={e} />}
      />
    );
  }

  function renderHosting() {
    if (fetchingHosting) return <SkeletonRows />;
    if (hosting.length === 0) {
      return (
        <EmptyState
          message="No upcoming events you're hosting"
          cta={
            <Link
              href="/events/new"
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
              Create an event
            </Link>
          }
        />
      );
    }
    return (
      <DateSections
        events={hosting}
        renderRow={(e) => <HostingRow key={e.id} event={e} />}
      />
    );
  }

  function renderCalendar() {
    return (
      <div
        style={{
          padding: "48px 24px",
          textAlign: "center",
          borderRadius: 16,
          border: "1px dashed var(--border-strong)",
        }}
      >
        <div style={{ opacity: 0.2, marginBottom: 14, display: "flex", justifyContent: "center" }}>
          <CalendarIcon size={40} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Calendar view coming soon</p>
        <p style={{ fontSize: 14, opacity: 0.5, lineHeight: 1.6 }}>
          A monthly calendar with your events is on the way.
        </p>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "upcoming",  label: "Upcoming"  },
    { id: "hosting",   label: "Hosting"   },
    { id: "calendar",  label: "Calendar"  },
  ];

  return (
    <main
      className="page-main"
      style={{ padding: "24px 20px 56px", maxWidth: 600, margin: "0 auto" }}
    >
      {/* Page heading — centered */}
      <header style={{ textAlign: "center", marginBottom: 20 }}>
        <h1 className="page-h1" style={{ fontSize: 28, fontWeight: 700 }}>
          Schedule
        </h1>
      </header>

      {/* Segmented control */}
      <div
        role="tablist"
        aria-label="Schedule views"
        style={{
          display: "flex",
          background: "var(--btn-bg)",
          borderRadius: 12,
          padding: 3,
          gap: 2,
          marginBottom: 28,
        }}
      >
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setTab(id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: 9,
                border: "none",
                background: active ? "var(--background)" : "transparent",
                fontWeight: active ? 700 : 400,
                fontSize: 13,
                color: active ? "var(--accent)" : "inherit",
                cursor: "pointer",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
                transition: "background 0.15s, color 0.15s, box-shadow 0.15s",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab panels */}
      {tab === "upcoming"  && renderUpcoming()}
      {tab === "hosting"   && renderHosting()}
      {tab === "calendar"  && renderCalendar()}
    </main>
  );
}

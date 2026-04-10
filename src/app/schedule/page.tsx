/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = "upcoming" | "hosting" | "calendar";

/**
 * Single unified event shape used across all three tabs.
 * role = "attending"  → user RSVPd going/maybe
 * role = "hosting"    → user created the event
 * role = "cohosting"  → user is an accepted co-host
 * When an event is both hosted AND attended, it appears once per role in the
 * source arrays but is deduped in the calendar (allUserEvents).
 */
type UserEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  visibility: "public" | "private";
  venue_name: string | null;
  venue_city: string | null;
  role: "attending" | "hosting" | "cohosting";
  response: "going" | "maybe" | null; // attending only
  is_approved: boolean;               // hosting only (true for attending rows)
};

// ── Date / format helpers ──────────────────────────────────────────────────────

const TZ = "America/Toronto";

/** "YYYY-MM-DD" key in Toronto time */
function dateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDateHeading(iso: string): string {
  const d   = new Date(iso);
  const now = new Date();
  const todayStr    = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const tom         = new Date(now); tom.setDate(now.getDate() + 1);
  const tomorrowStr = tom.toLocaleDateString("en-CA", { timeZone: TZ });
  const eventStr    = d.toLocaleDateString("en-CA",   { timeZone: TZ });
  if (eventStr === todayStr)    return "Today";
  if (eventStr === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric",
  });
}

function groupByDate(events: UserEvent[]) {
  const sections: { heading: string; dateStr: string; events: UserEvent[] }[] = [];
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

function ChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Shared UI ──────────────────────────────────────────────────────────────────

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

function Thumbnail({ src }: { src: string | null }) {
  if (src) {
    return <img src={src} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div style={{ width: 64, height: 64, borderRadius: 10, background: "var(--surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.35 }}>
      <CalendarIcon size={22} />
    </div>
  );
}

function EmptyState({ message, cta }: { message: string; cta?: React.ReactNode }) {
  return (
    <div style={{ padding: "48px 24px", textAlign: "center", borderRadius: 16, border: "1px dashed var(--border-strong)" }}>
      <div style={{ opacity: 0.2, marginBottom: 14, display: "flex", justifyContent: "center" }}>
        <CalendarIcon size={40} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{message}</p>
      {cta}
    </div>
  );
}

// ── Unified event row ──────────────────────────────────────────────────────────
// Handles both attending and hosting layouts from a single component.

function EventRow({ event }: { event: UserEvent }) {
  const location  = [event.venue_name, event.venue_city].filter(Boolean).join(" · ");
  const isPrivate = event.visibility === "private";

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start", cursor: "pointer" }}>
        <div style={{ flexShrink: 0 }}><Thumbnail src={event.image_url} /></div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3, paddingTop: 1 }}>

          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {event.role === "attending" && event.response && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                padding: "2px 6px", borderRadius: 20,
                background: event.response === "going" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.12)",
                color:      event.response === "going" ? "#10b981"               : "#f59e0b",
                border:    `1px solid ${event.response === "going" ? "rgba(16,185,129,0.20)" : "rgba(245,158,11,0.20)"}`,
              }}>
                {event.response === "going" ? <CheckIcon /> : <StarIcon />}
                {event.response === "going" ? "Going" : "Interested"}
              </span>
            )}
            {(event.role === "hosting" || event.role === "cohosting") && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                padding: "2px 6px", borderRadius: 20,
                background: "rgba(99,102,241,0.10)", color: "#6366f1",
                border: "1px solid rgba(99,102,241,0.18)",
              }}>
                {event.role === "cohosting" ? "Co-host" : "Hosting"}
              </span>
            )}
            {event.role === "hosting" && !event.is_approved && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                padding: "2px 6px", borderRadius: 20,
                background: "rgba(245,158,11,0.12)", color: "#f59e0b",
                border: "1px solid rgba(245,158,11,0.20)",
              }}>
                Pending review
              </span>
            )}
            {isPrivate && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                padding: "2px 6px", borderRadius: 20,
                background: "rgba(124,58,237,0.10)", color: "var(--accent)",
                border: "1px solid rgba(124,58,237,0.15)",
              }}>
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

// ── Date-section list ──────────────────────────────────────────────────────────

function DateSections({ events }: { events: UserEvent[] }) {
  const sections = groupByDate(events);
  return (
    <div>
      {sections.map((section) => (
        <section key={section.dateStr} style={{ marginBottom: 28 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
            opacity: 0.4, textTransform: "uppercase",
            paddingBottom: 6, borderBottom: "1px solid var(--border)", marginBottom: 2,
          }}>
            {section.heading}
          </div>
          {section.events.map((e) => <EventRow key={`${e.role}-${e.id}`} event={e} />)}
        </section>
      ))}
    </div>
  );
}

// ── Calendar grid ──────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function CalendarGrid({
  year,
  month,
  eventsByDate,
  selectedDate,
  onSelectDate,
  onPrev,
  onNext,
}: {
  year: number;
  month: number;   // 0-indexed
  eventsByDate: Map<string, UserEvent[]>;
  selectedDate: string | null;
  onSelectDate: (key: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const todayKey       = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const touchStartX    = useRef<number | null>(null);

  // Build flat cell array: null = empty leading cell, number = day-of-month
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function cellDateKey(day: number): string {
    return new Date(year, month, day).toLocaleDateString("en-CA", { timeZone: TZ });
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 48) return;
    if (dx < 0) onNext(); else onPrev();
  }

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          type="button"
          onClick={onPrev}
          aria-label="Previous month"
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.07)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--foreground)",
          }}
        >
          <ChevronLeft />
        </button>
        <span style={{ fontWeight: 700, fontSize: 16 }}>
          {MONTH_NAMES[month]} {year}
        </span>
        <button
          type="button"
          onClick={onNext}
          aria-label="Next month"
          style={{
            width: 36, height: 36, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.07)", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--foreground)",
          }}
        >
          <ChevronRight />
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 8 }}>
        {WEEKDAYS.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, opacity: 0.35, letterSpacing: "0.04em", padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const key     = cellDateKey(day);
          const events  = eventsByDate.get(key) ?? [];
          const count   = events.length;
          const isToday = key === todayKey;
          const isSel   = key === selectedDate;
          const imgSrc  = count > 0 ? events[0].image_url : null;

          return (
            <div
              key={key}
              onClick={() => onSelectDate(isSel ? null : key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                paddingTop: 2,
                paddingBottom: 4,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 36, height: 36,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: imgSrc ? "visible" : "visible",
                  background: imgSrc
                    ? "transparent"
                    : isToday
                    ? "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
                    : "transparent",
                  boxShadow: isSel
                    ? "0 0 0 2.5px #a78bfa"
                    : isToday && !imgSrc
                    ? "0 4px 16px rgba(124,58,237,0.45)"
                    : "none",
                }}
              >
                {imgSrc ? (
                  <>
                    <img
                      src={imgSrc}
                      alt=""
                      style={{
                        width: 36, height: 36,
                        objectFit: "cover", borderRadius: "50%",
                        display: "block",
                        boxShadow: isSel ? "0 0 0 2.5px #a78bfa" : "none",
                      }}
                    />
                    {/* Gradient overlay for number readability */}
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.40) 100%)",
                      pointerEvents: "none",
                    }} />
                    {/* Day number on top of image */}
                    <span style={{
                      position: "absolute",
                      fontSize: 12, fontWeight: 700,
                      color: "#fff",
                      textShadow: "0 1px 3px rgba(0,0,0,0.85)",
                      lineHeight: 1,
                    }}>
                      {day}
                    </span>
                    {/* Multi-event count badge */}
                    {count > 1 && (
                      <span style={{
                        position: "absolute", bottom: -1, right: -1,
                        width: 15, height: 15, borderRadius: "50%",
                        background: "#7c3aed",
                        border: "1.5px solid rgba(12,9,18,0.92)",
                        fontSize: 8, fontWeight: 800,
                        color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        lineHeight: 1,
                      }}>
                        {count}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{
                    fontSize: 14,
                    fontWeight: isToday || isSel ? 700 : 400,
                    color: isToday
                      ? "#fff"
                      : isSel
                      ? "#a78bfa"
                      : "rgba(234,232,228,0.72)",
                    lineHeight: 1,
                  }}>
                    {day}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { user, loading: authLoading, session } = useAuth();

  const [tab, setTab] = useState<Tab>("upcoming");

  useEffect(() => {
    document.body.classList.add("is-aurora-page");
    return () => { document.body.classList.remove("is-aurora-page"); };
  }, []);

  // ── Unified fetch state ──────────────────────────────────────────────────────
  // Two queries, same UserEvent shape. Both fire on mount; tabs read from these.
  const [attendingEvents, setAttendingEvents] = useState<UserEvent[]>([]);
  const [hostingEvents,   setHostingEvents]   = useState<UserEvent[]>([]);
  const [fetchingAttend,  setFetchingAttend]  = useState(false);
  const [fetchingHosting, setFetchingHosting] = useState(false);

  // ── Calendar UI state ────────────────────────────────────────────────────────
  const now = new Date();
  const [calYear,  setCalYear]  = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());    // 0-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // 14-day cutoff for the Upcoming tab — computed once at mount via useState
  // lazy initializer (the only place impure calls like new Date() are permitted).
  const [cutoff14] = useState(
    () => new Date(new Date().getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  );

  // ── Fetch: attending (going / maybe RSVPs) ───────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchingAttend(true);
    supabaseBrowser()
      .from("rsvps")
      .select("response, events(id, title, start_at, image_url, visibility, venues(name, city))")
      .eq("user_id", user.id)
      .in("response", ["going", "maybe"])
      .then(({ data }) => {
        const cutoff = new Date().toISOString();
        const rows: UserEvent[] = [];
        for (const row of data ?? []) {
          const ev = Array.isArray(row.events) ? row.events[0] : row.events;
          if (!ev || ev.start_at < cutoff) continue;
          const venue = Array.isArray(ev.venues) ? ev.venues[0] : ev.venues;
          rows.push({
            id:          ev.id,
            title:       ev.title,
            start_at:    ev.start_at,
            image_url:   ev.image_url,
            visibility:  ev.visibility as "public" | "private",
            venue_name:  venue?.name  ?? null,
            venue_city:  venue?.city  ?? null,
            role:        "attending",
            response:    row.response as "going" | "maybe",
            is_approved: true,
          });
        }
        rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
        setAttendingEvents(rows);
        setFetchingAttend(false);
      });
  }, [user]);

  // ── Fetch: hosting (events created by user) ──────────────────────────────────
  // Uses /api/profile (service-role key) to bypass RLS, which would otherwise
  // block the browser anon client from reading the user's own non-public events.
  // The profile API already returns json.events = all events where creator_id = me.
  useEffect(() => {
    if (!session?.access_token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetchingHosting(true);

    fetch("/api/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.ok) {
          console.debug("[schedule/hosting] profile API returned not-ok:", json);
          setFetchingHosting(false);
          return;
        }

        const rawEvents: {
          id: string;
          title: string;
          start_at: string;
          image_url: string | null;
          visibility: string;
          is_approved: boolean;
          status: string;
          role?: string;
        }[] = json.events ?? [];

        console.debug("[schedule/hosting] raw events from API:", rawEvents.length, rawEvents.map((e) => e.id));

        const now  = new Date().toISOString();
        const rows: UserEvent[] = rawEvents
          // upcoming only
          .filter((ev) => ev.start_at >= now)
          .map((ev) => ({
            id:          ev.id,
            title:       ev.title,
            start_at:    ev.start_at,
            image_url:   ev.image_url,
            visibility:  ev.visibility as "public" | "private",
            // /api/profile doesn't join venues — resolved separately below
            venue_name:  null,
            venue_city:  null,
            role:        ev.role === "cohosting" ? ("cohosting" as const) : ("hosting" as const),
            response:    null,
            is_approved: ev.is_approved,
          }));

        rows.sort((a, b) => a.start_at.localeCompare(b.start_at));
        console.debug("[schedule/hosting] upcoming hosted events:", rows.length);
        setHostingEvents(rows);
        setFetchingHosting(false);
      })
      .catch((err) => {
        console.error("[schedule/hosting] fetch error:", err);
        setFetchingHosting(false);
      });
  }, [session?.access_token]);

  // ── Derived: all user events, deduped by id, for the calendar ────────────────
  // Hosting/co-hosting takes priority over attending when the same event appears in both.
  const allUserEvents = useMemo<UserEvent[]>(() => {
    const seen = new Map<string, UserEvent>();
    // Hosting/cohosting takes priority — add first so attending doesn't overwrite
    for (const e of hostingEvents)   seen.set(e.id, e);
    for (const e of attendingEvents) { if (!seen.has(e.id)) seen.set(e.id, e); }
    return Array.from(seen.values()).sort((a, b) => a.start_at.localeCompare(b.start_at));
  }, [attendingEvents, hostingEvents]);

  // ── Derived: events keyed by YYYY-MM-DD for the calendar ─────────────────────
  const eventsByDate = useMemo<Map<string, UserEvent[]>>(() => {
    const map = new Map<string, UserEvent[]>();
    for (const e of allUserEvents) {
      const key = dateKey(e.start_at);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [allUserEvents]);

  // ── Calendar navigation ───────────────────────────────────────────────────────
  function prevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else                  setCalMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else                   setCalMonth((m) => m + 1);
    setSelectedDate(null);
  }

  // ── Auth loading ──────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main className="page-main app-page" style={{ padding: "24px 20px", maxWidth: 600, margin: "0 auto", minHeight: "100dvh" }}>
        <div className="page-top-glow" aria-hidden="true" />
        <div style={{ height: 32, width: 120, borderRadius: 8, background: "var(--surface-raised)", margin: "0 auto 20px" }} />
        <div style={{ height: 40, borderRadius: 12, background: "var(--surface-raised)", marginBottom: 24 }} />
        <SkeletonRows count={3} />
      </main>
    );
  }

  // ── Signed-out gate ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main className="page-main app-page" style={{ padding: "48px 20px", maxWidth: 600, margin: "0 auto", textAlign: "center", minHeight: "100dvh" }}>
        <div className="page-top-glow" aria-hidden="true" />
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
          style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          Sign in
        </button>
      </main>
    );
  }

  // ── Tab renderers ─────────────────────────────────────────────────────────────

  function renderUpcoming() {
    if (fetchingAttend) return <SkeletonRows />;

    // Limit Upcoming to events starting within the next 14 days.
    // attendingEvents is already sorted ascending and filtered to start_at >= now.
    const upcomingWindow = attendingEvents.filter((e) => e.start_at <= cutoff14);

    if (upcomingWindow.length === 0) {
      // City name used in the discovery CTA.
      // Outsy currently serves Montréal only; update here when multi-city lands.
      const city = "Montréal";
      return (
        <EmptyState
          message="Sounds a bit quiet around here…"
          cta={
            <p style={{ fontSize: 14, opacity: 0.55, lineHeight: 1.7, margin: 0 }}>
              <Link
                href="/map"
                style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
              >
                See what&apos;s happening in {city}
              </Link>
            </p>
          }
        />
      );
    }
    return <DateSections events={upcomingWindow} />;
  }

  function renderHosting() {
    if (fetchingHosting) return <SkeletonRows />;
    if (hostingEvents.length === 0) {
      return (
        <EmptyState
          message="You're not hosting anything yet"
          cta={
            <Link
              href="/events/new"
              style={{ display: "inline-block", padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit" }}
            >
              Create an event
            </Link>
          }
        />
      );
    }
    return <DateSections events={hostingEvents} />;
  }

  function renderCalendar() {
    const fetching = fetchingAttend || fetchingHosting;
    const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

    return (
      <div>
        {fetching ? (
          <div style={{ height: 280, borderRadius: 12, background: "var(--surface-raised)" }} />
        ) : (
          <CalendarGrid
            year={calYear}
            month={calMonth}
            eventsByDate={eventsByDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onPrev={prevMonth}
            onNext={nextMonth}
          />
        )}

        {/* Selected-day event list */}
        {selectedDate && (
          <div style={{ marginTop: 24 }}>
            <div style={{
              fontSize: 15, fontWeight: 700,
              paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 4,
            }}>
              {formatDateHeading(selectedDate + "T12:00:00")}
            </div>
            {selectedEvents.length === 0 ? (
              <Link href="/events/new" style={{ textDecoration: "none", display: "block", marginTop: 10 }}>
                <div style={{
                  background: "linear-gradient(135deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.02) 100%)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 18, padding: "14px 16px",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.20), 0 1px 0 rgba(255,255,255,0.06) inset",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                    background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 12px rgba(124,58,237,0.40)",
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#eae8e4", marginBottom: 2 }}>Create an event</div>
                    <div style={{ fontSize: 12, color: "rgba(234,232,228,0.50)" }}>Host something on this day</div>
                  </div>
                  {/* Chevron */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(234,232,228,0.35)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>
            ) : (
              selectedEvents.map((e) => <EventRow key={`${e.role}-${e.id}`} event={e} />)
            )}
          </div>
        )}

        {!fetching && allUserEvents.length === 0 && !selectedDate && (
          <EmptyState
            message="No events on your calendar yet"
            cta={
              <Link
                href="/events"
                style={{ display: "inline-block", marginTop: 8, padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit" }}
              >
                Explore events
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "hosting",  label: "Hosting"  },
    { id: "calendar", label: "Calendar" },
  ];

  return (
    <main className="page-main app-page" style={{ padding: "24px 20px 56px", maxWidth: 600, margin: "0 auto", minHeight: "100dvh" }}>
      <div className="page-top-glow" aria-hidden="true" />
      {/* Centered heading */}
      <header style={{ textAlign: "center", marginBottom: 20 }}>
        <h1 className="page-h1" style={{ fontSize: 28, fontWeight: 700 }}>Schedule</h1>
      </header>

      {/* Segmented control */}
      <div
        role="tablist"
        aria-label="Schedule views"
        style={{ display: "flex", background: "var(--btn-bg)", borderRadius: 12, padding: 3, gap: 2, marginBottom: 28 }}
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
                flex: 1, padding: "8px 4px", borderRadius: 9, border: "none",
                background: active ? "var(--background)" : "transparent",
                fontWeight: active ? 700 : 400, fontSize: 13,
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

      {/* Panels */}
      {tab === "upcoming" && renderUpcoming()}
      {tab === "hosting"  && renderHosting()}
      {tab === "calendar" && renderCalendar()}
    </main>
  );
}

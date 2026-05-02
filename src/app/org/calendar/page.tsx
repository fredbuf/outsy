/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type OrgEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  visibility: string;
  is_approved: boolean;
  venue_name: string | null;
  venue_city: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const TZ = "America/Toronto";

function dateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function formatDateHeading(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  const tomorrowStr = tom.toLocaleDateString("en-CA", { timeZone: TZ });
  const eventStr = d.toLocaleDateString("en-CA", { timeZone: TZ });
  if (eventStr === todayStr) return "Today";
  if (eventStr === tomorrowStr) return "Tomorrow";
  return d.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function ChevronLeft() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6"/></svg>;
}
function ChevronRight() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6"/></svg>;
}
function PinIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>;
}

// ── Calendar grid ──────────────────────────────────────────────────────────────

const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

function CalendarGrid({
  year, month, slideDir, eventsByDate, selectedDate,
  onSelectDate, onPrev, onNext,
}: {
  year: number; month: number; slideDir: "prev" | "next" | null;
  eventsByDate: Map<string, OrgEvent[]>; selectedDate: string | null;
  onSelectDate: (key: string | null) => void; onPrev: () => void; onNext: () => void;
}) {
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  const calDivRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchLockedH = useRef(false);

  useEffect(() => {
    const el = calDivRef.current;
    if (!el) return;
    function onTouchMove(e: TouchEvent) {
      if (touchStartX.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - (touchStartY.current ?? 0);
      if (!touchLockedH.current) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) { touchLockedH.current = true; }
        else if (Math.abs(dy) > 10) { touchStartX.current = null; touchStartY.current = null; return; }
      }
      if (touchLockedH.current) e.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const monthKey = year * 12 + month;
  const slideClass = slideDir === "next" ? "cal-slide-next" : slideDir === "prev" ? "cal-slide-prev" : "";

  function cellDateKey(day: number) {
    return new Date(year, month, day).toLocaleDateString("en-CA", { timeZone: TZ });
  }

  return (
    <div
      ref={calDivRef}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; touchLockedH.current = false; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || !touchLockedH.current) { touchStartX.current = null; touchStartY.current = null; touchLockedH.current = false; return; }
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null; touchStartY.current = null; touchLockedH.current = false;
        if (Math.abs(dx) < 48) return;
        if (dx < 0) onNext(); else onPrev();
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button type="button" onClick={onPrev} aria-label="Previous month" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.07)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }}><ChevronLeft /></button>
        <span key={`label-${monthKey}`} className={slideClass} style={{ fontWeight: 700, fontSize: 16 }}>{MONTH_NAMES[month]} {year}</span>
        <button type="button" onClick={onNext} aria-label="Next month" style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.07)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--foreground)" }}><ChevronRight /></button>
      </div>

      <div key={`grid-${monthKey}`} className={slideClass}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 8 }}>
          {WEEKDAYS.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, opacity: 0.35, letterSpacing: "0.04em", padding: "4px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const key = cellDateKey(day);
            const evs = eventsByDate.get(key) ?? [];
            const count = evs.length;
            const isToday = key === todayKey;
            const isSel = key === selectedDate;
            const imgSrc = count > 0 ? evs[0].image_url : null;
            return (
              <div key={key} onClick={() => onSelectDate(isSel ? null : key)} style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, paddingBottom: 4, cursor: "pointer" }}>
                <div style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: imgSrc ? "transparent" : isToday ? "#2563E2" : "transparent", boxShadow: isSel ? "0 0 0 2.5px #2563E2" : isToday && !imgSrc ? "0 4px 16px rgba(37,99,226,0.40)" : "none" }}>
                  {imgSrc ? (
                    <>
                      <img src={imgSrc} alt="" style={{ width: 36, height: 36, objectFit: "cover", borderRadius: "50%", display: "block", boxShadow: isSel ? "0 0 0 2.5px #2563E2" : "none" }} />
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.40) 100%)", pointerEvents: "none" }} />
                      <span style={{ position: "absolute", fontSize: 12, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.85)", lineHeight: 1 }}>{day}</span>
                      {count > 1 && <span style={{ position: "absolute", bottom: -1, right: -1, width: 15, height: 15, borderRadius: "50%", background: "#2563E2", border: "1.5px solid rgba(12,9,18,0.92)", fontSize: 8, fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>{count}</span>}
                    </>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: isToday || isSel ? 700 : 400, color: isToday ? "#fff" : isSel ? "#2563E2" : "rgba(234,232,228,0.72)", lineHeight: 1 }}>{day}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function OrgCalendarPage() {
  const { session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();

  const [events, setEvents] = useState<OrgEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSlideDir, setCalSlideDir] = useState<"prev" | "next" | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Sliding indicator — suppress animation on first render
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!session || !activeOrganizer) return;
    setLoading(true);
    fetch(`/api/organizers/${activeOrganizer.organizerId}/events`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; events?: OrgEvent[] }) => {
        if (d.ok) setEvents(d.events ?? []);
      })
      .finally(() => setLoading(false));
  }, [session?.access_token, activeOrganizer?.organizerId]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, OrgEvent[]>();
    for (const e of events) {
      const key = dateKey(e.start_at);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  function prevMonth() {
    setCalSlideDir("prev");
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); } else setCalMonth((m) => m - 1);
    setSelectedDate(null);
  }
  function nextMonth() {
    setCalSlideDir("next");
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); } else setCalMonth((m) => m + 1);
    setSelectedDate(null);
  }

  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 80px", minHeight: "100dvh" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px" }}>Calendar</h1>

      {loading ? (
        <div style={{ height: 280, borderRadius: 12, background: "var(--surface-raised)" }} />
      ) : (
        <CalendarGrid
          year={calYear} month={calMonth} slideDir={calSlideDir}
          eventsByDate={eventsByDate} selectedDate={selectedDate}
          onSelectDate={setSelectedDate} onPrev={prevMonth} onNext={nextMonth}
        />
      )}

      {/* Selected day */}
      {!loading && selectedDate && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, paddingBottom: 10, borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
            {formatDateHeading(selectedDate + "T12:00:00")}
          </div>
          {selectedEvents.length === 0 ? (
            <Link href="/events/new" style={{ textDecoration: "none", display: "block", marginTop: 10 }}>
              <div style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.065) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 18, padding: "14px 16px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, background: "linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#eae8e4" }}>Create an event</div>
                  <div style={{ fontSize: 12, color: "rgba(234,232,228,0.50)" }}>Schedule something on this day</div>
                </div>
              </div>
            </Link>
          ) : (
            selectedEvents.map((e) => {
              const location = [e.venue_name, e.venue_city].filter(Boolean).join(" · ");
              return (
                <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", alignItems: "flex-start" }}>
                    {e.image_url ? (
                      <img src={e.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--surface-raised)", flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{e.title}</div>
                      <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>
                        {formatTime(e.start_at)}
                        {location && <> · <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}><PinIcon />{location}</span></>}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      )}

      {!loading && events.length === 0 && !selectedDate && (
        <div style={{ marginTop: 24, padding: "48px 24px", textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No events on this organizer&apos;s calendar</p>
          <Link href="/events/new" style={{ display: "inline-block", marginTop: 14, padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit" }}>
            Create an event
          </Link>
        </div>
      )}
    </main>
  );
}

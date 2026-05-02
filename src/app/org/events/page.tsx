/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";

const TZ = "America/Toronto";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: TZ, weekday: "short", month: "short",
    day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

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

function EventRow({ event }: { event: OrgEvent }) {
  const location = [event.venue_name, event.venue_city].filter(Boolean).join(" · ");
  const isPast = event.start_at < new Date().toISOString();

  return (
    <Link href={`/events/${event.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        display: "flex", gap: 12, padding: "12px 0",
        borderBottom: "1px solid var(--border)", alignItems: "flex-start",
        opacity: isPast ? 0.55 : 1,
      }}>
        {event.image_url ? (
          <img src={event.image_url} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: 10, background: "var(--surface-raised)", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {!event.is_approved && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.20)" }}>
                Pending
              </span>
            )}
            {event.visibility === "private" && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: "rgba(124,58,237,0.10)", color: "var(--accent)", border: "1px solid rgba(124,58,237,0.15)" }}>
                Private
              </span>
            )}
            {isPast && (
              <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 20, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.10)" }}>
                Past
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {event.title}
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>
            {formatDate(event.start_at)}
            {location && <> · {location}</>}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function OrgEventsPage() {
  const { session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();
  const [events, setEvents] = useState<OrgEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

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

  const now = new Date().toISOString();
  const upcoming = (events ?? []).filter((e) => e.start_at >= now);
  const past = (events ?? []).filter((e) => e.start_at < now).reverse();

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 80px", minHeight: "100dvh" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Events</h1>
        <Link
          href="/events/new"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "7px 14px", borderRadius: 20,
            background: "rgba(94,168,255,0.12)", border: "1px solid rgba(94,168,255,0.25)",
            color: "#5EA8FF", fontWeight: 600, fontSize: 13, textDecoration: "none",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Create
        </Link>
      </div>

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>
      ) : !events || events.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 16 }}>
          <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No events yet</p>
          <Link href="/events/new" style={{ display: "inline-block", marginTop: 14, padding: "9px 20px", borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, textDecoration: "none", color: "inherit" }}>
            Create your first event
          </Link>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
                Upcoming · {upcoming.length}
              </div>
              {upcoming.map((e) => <EventRow key={e.id} event={e} />)}
            </section>
          )}
          {past.length > 0 && (
            <section>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", opacity: 0.4, textTransform: "uppercase", marginBottom: 4 }}>
                Past · {past.length}
              </div>
              {past.map((e) => <EventRow key={e.id} event={e} />)}
            </section>
          )}
        </>
      )}
    </main>
  );
}

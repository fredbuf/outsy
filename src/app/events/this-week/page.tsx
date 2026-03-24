/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "../../components/AuthProvider";

// ─── Timezone / week helpers ──────────────────────────────────────────────────

function montrealDayStart(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const s = Number(parts.find((p) => p.type === "second")?.value ?? "0");
  return new Date(noonUtc.getTime() - (h * 3600 + m * 60 + s) * 1000).toISOString();
}

// Monday 00:00 → next-Monday 00:00, Montréal time, as UTC ISO strings.
function thisWeekBoundsIso(): { start: string; end: string } {
  const now = new Date();
  const montrealDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const dayName = now.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "short" });
  const offsets: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysFromMonday = offsets[dayName] ?? 0;
  const [y, mo, d] = montrealDateStr.split("-").map(Number);
  const mondayStr = new Date(Date.UTC(y, mo - 1, d - daysFromMonday)).toISOString().slice(0, 10);
  const nextMondayStr = new Date(Date.UTC(y, mo - 1, d - daysFromMonday + 7)).toISOString().slice(0, 10);
  return { start: montrealDayStart(mondayStr), end: montrealDayStart(nextMondayStr) };
}

function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const toDateKey = (date: Date) =>
    date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const eventDay = toDateKey(d);
  const today = toDateKey(now);
  const tomorrow = toDateKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const timeStr = rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();
  if (eventDay === today) return `Today at ${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow at ${timeStr}`;
  const weekday = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "long" });
  return `${weekday} at ${timeStr}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = "music" | "nightlife" | "art";

type EventRow = {
  id: string;
  title: string;
  start_at: string;
  category_primary: Category;
  image_url: string | null;
  venues: { name: string; city: string | null } | null;
};

type TileRsvpData = {
  counts: Record<string, number>;
  names: Record<string, string[]>;
  avatars: Record<string, (string | null)[]>;
};

const EMPTY_RSVP: TileRsvpData = { counts: {}, names: {}, avatars: {} };

// ─── Shared helpers ───────────────────────────────────────────────────────────

function categoryBg(cat: Category): string {
  switch (cat) {
    case "music":     return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife": return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "art":       return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    default:          return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

async function fetchTileRsvpData(ids: string[]): Promise<TileRsvpData> {
  if (ids.length === 0) return EMPTY_RSVP;
  const { data } = await supabaseBrowser()
    .from("rsvps")
    .select("event_id,profiles(display_name,avatar_url)")
    .in("event_id", ids)
    .in("response", ["going", "maybe"])
    .limit(500);

  const counts: Record<string, number> = {};
  const names: Record<string, string[]> = {};
  const avatars: Record<string, (string | null)[]> = {};

  for (const row of (data ?? []) as {
    event_id: string;
    profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
  }[]) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const name = p?.display_name;
    if (name) {
      if (!names[row.event_id]) { names[row.event_id] = []; avatars[row.event_id] = []; }
      if (names[row.event_id].length < 2) {
        names[row.event_id].push(name.split(" ")[0]);
        avatars[row.event_id].push(p?.avatar_url ?? null);
      }
    }
  }
  return { counts, names, avatars };
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ThisWeekPage() {
  const { user, session } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tileRsvp, setTileRsvp] = useState<TileRsvpData>(EMPTY_RSVP);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [starPending, setStarPending] = useState<Set<string>>(new Set());
  // weekBounds computed once at mount — useState initializer is safe for Date.now()
  const [weekBounds] = useState(() => thisWeekBoundsIso());

  // Fetch all events in the current week.
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const { data } = await supabaseBrowser()
        .from("events")
        .select("id,title,start_at,category_primary,image_url,venues(name,city)")
        .eq("city_normalized", "montreal")
        .eq("status", "scheduled")
        .eq("is_approved", true)
        .eq("is_rejected", false)
        .eq("visibility", "public")
        .gte("start_at", weekBounds.start)
        .lt("start_at", weekBounds.end)
        .order("start_at", { ascending: true })
        .limit(200);
      const rows = (data ?? []) as unknown as EventRow[];
      setEvents(rows);
      setLoading(false);
      if (rows.length > 0) {
        fetchTileRsvpData(rows.map((r) => r.id)).then(setTileRsvp);
      }
    };
    run();
  }, [weekBounds]);

  // Load the current user's "maybe" RSVPs.
  useEffect(() => {
    if (!user?.id) { setStarredIds(new Set()); return; }
    supabaseBrowser()
      .from("rsvps")
      .select("event_id")
      .eq("user_id", user.id)
      .eq("response", "maybe")
      .then(({ data }) => {
        setStarredIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id)));
      });
  }, [user?.id]);

  async function handleStar(eventId: string, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!session?.access_token) {
      window.dispatchEvent(new CustomEvent("outsy:open-signin"));
      return;
    }
    if (starPending.has(eventId)) return;
    const wasStarred = starredIds.has(eventId);
    setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.delete(eventId); } else { s.add(eventId); } return s; });
    setStarPending((prev) => new Set(prev).add(eventId));
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: wasStarred ? "DELETE" : "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        ...(wasStarred ? {} : { body: JSON.stringify({ response: "maybe" }) }),
      });
      if (!res.ok) {
        setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
      }
    } catch {
      setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
    } finally {
      setStarPending((prev) => { const s = new Set(prev); s.delete(eventId); return s; });
    }
  }

  return (
    <div style={{ display: "grid", gap: 20, padding: "0 0 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Link
          href="/events"
          style={{ color: "inherit", textDecoration: "none", opacity: 0.5, fontSize: 22, lineHeight: 1 }}
          aria-label="Back to events"
        >
          ‹
        </Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>This week</h1>
      </div>

      {loading ? (
        <p>Loading events…</p>
      ) : events.length === 0 ? (
        <p style={{ opacity: 0.5 }}>No events this week.</p>
      ) : (
        <div
          className="events-grid"
          style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {events.map((e) => {
            const rsvpCount = tileRsvp.counts[e.id] ?? 0;
            const rsvpNames = tileRsvp.names[e.id] ?? [];
            const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
            const starred = starredIds.has(e.id);
            const pending = starPending.has(e.id);
            return (
              <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
                <article style={{ borderRadius: 14, overflow: "hidden", position: "relative" }}>
                  <div style={{ position: "relative", width: "100%", paddingBottom: "56%", background: categoryBg(e.category_primary) }}>
                    {e.image_url && (
                      <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
                    {/* Star button */}
                    <button
                      type="button"
                      aria-label={starred ? "Remove from saved" : "Save event"}
                      onClick={(ev) => handleStar(e.id, ev)}
                      style={{
                        position: "absolute", top: 8, right: 8,
                        width: 32, height: 32, borderRadius: "50%", border: "none",
                        background: starred ? "rgba(245,158,11,0.75)" : "rgba(0,0,0,0.42)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: pending ? "wait" : "pointer",
                        color: starred ? "#fff" : "rgba(255,255,255,0.85)",
                        opacity: pending ? 0.6 : 1,
                      }}
                    >
                      <StarIcon filled={starred} />
                    </button>
                    {/* Text overlay */}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(e.start_at)}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{e.title}</div>
                      {e.venues?.name && (
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.venues.city ? `${e.venues.name}, ${e.venues.city}` : e.venues.name}
                        </div>
                      )}
                      {rsvpCount > 0 && (
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                          <div style={{ display: "flex" }}>
                            {rsvpAvatars.slice(0, 2).map((avatarUrl, i) =>
                              avatarUrl ? (
                                <img key={i} src={avatarUrl} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(0,0,0,0.55)", marginLeft: i > 0 ? -5 : 0, flexShrink: 0 }} />
                              ) : (
                                <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", background: getAvatarColor(rsvpNames[i] ?? ""), border: "1.5px solid rgba(0,0,0,0.55)", marginLeft: i > 0 ? -5 : 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                  {(rsvpNames[i] ?? "?")[0].toUpperCase()}
                                </div>
                              )
                            )}
                          </div>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                            {rsvpNames.length > 0 ? `${rsvpNames[0]}${rsvpCount > 1 ? ` + ${rsvpCount - 1}` : ""}` : `${rsvpCount} going`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

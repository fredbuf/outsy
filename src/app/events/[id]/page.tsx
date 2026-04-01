/* eslint-disable @next/next/no-img-element */
import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { AttendeeList } from "./AttendeeList";
import { EventOwnerActions } from "./EventOwnerActions";
import { ActionBar } from "./ActionBar";
import { ExpandableDescription } from "./ExpandableDescription";
import { ShareButton } from "./ShareButton";
import { InviteFriendsButton } from "./InviteFriendsButton";
import { BackButton } from "./BackButton";

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,start_at,end_at,category_primary,status,min_price,max_price,currency,image_url,source_url,source,visibility,creator_id,profiles!creator_id(display_name,avatar_url,username),venues(name,address_line1,city,lat,lng)"
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
    .in("status", ["scheduled", "announced"])
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

type ActivityItem = {
  response: "going" | "maybe" | "cant_go";
  updated_at: string;
  display_name: string | null;
  avatar_url: string | null;
  userId: string | null;
};

async function fetchRecentActivity(eventId: string): Promise<ActivityItem[]> {
  const { data } = await supabaseServer()
    .from("rsvps")
    .select("response,updated_at,profiles(id,display_name,avatar_url)")
    .eq("event_id", eventId)
    .in("response", ["going", "maybe", "cant_go"])
    .order("updated_at", { ascending: false })
    .limit(3);
  return (data ?? []).map((row) => {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      response: row.response as "going" | "maybe" | "cant_go",
      updated_at: row.updated_at as string,
      display_name: (p as { display_name: string | null } | null)?.display_name ?? null,
      avatar_url: (p as { avatar_url: string | null } | null)?.avatar_url ?? null,
      userId: (p as { id: string } | null)?.id ?? null,
    };
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function rsvpActivityLabel(r: "going" | "maybe" | "cant_go"): { text: string; color: string } {
  if (r === "going")   return { text: "is going",     color: "#10b981" };
  if (r === "maybe")   return { text: "might go",     color: "#f59e0b" };
  return                       { text: "can't make it", color: "#ef4444" };
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
  const creatorId = (event as { creator_id?: string | null }).creator_id ?? null;
  const [related, rsvpCounts, attendees] = await Promise.all([
    fetchRelated(id, event.category_primary),
    fetchRsvpCounts(id),
    fetchAttendees(id),
  ]);

  /* ── Private event: social layout ──────────────────────────────────────── */
  if (event.visibility === "private") {
    const address = venue?.address_line1 ?? null;
    const recentActivity = await fetchRecentActivity(id);

    // Date helpers for the details section
    const startD = new Date(event.start_at);
    const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
    const dateLine = startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
    });
    const timeLine = isUnknownTime ? null : startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
    });
    return (
      <main style={{ padding: 0, position: "relative", minHeight: "100dvh" }}>

        {/* ── Ambient background: blurred image tones fill the full page ── */}
        {event.image_url ? (
          <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
            <img
              src={event.image_url}
              alt=""
              width={800}
              height={800}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                filter: "blur(80px) saturate(1.8) brightness(0.38)",
                transform: "scale(1.15)",
                pointerEvents: "none",
              }}
            />
          </div>
        ) : (
          <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, background: "#111110", pointerEvents: "none" }} />
        )}

        <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Top card: full-bleed image with info overlay ──────────────────
             Single unified container — image defines height, title/date/
             location sit on a warm gradient at the bottom of the image.
             Rounded bottom corners give the Apple Invites "card" feel.   */}
        <div
          style={{
            position: "relative",
            borderRadius: "0 0 28px 28px",
            overflow: "hidden",
          }}
        >
          {/* Image — defines the card height via aspectRatio */}
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              style={{
                display: "block",
                width: "100%",
                aspectRatio: "3/4",
                objectFit: "cover",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "3/4",
                background: categoryBg(event.category_primary),
              }}
            />
          )}

          {/* Nav controls — float over the top of the image */}
          <div
            style={{
              position: "absolute", top: 20, left: 16, right: 16,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              zIndex: 2,
            }}
          >
            <BackButton
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(0,0,0,0.32)",
                border: "1px solid rgba(255,255,255,0.15)",
                cursor: "pointer", color: "#fff", flexShrink: 0,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </BackButton>
            <EventOwnerActions
              compact
              eventId={id}
              creatorId={(event as { creator_id?: string | null }).creator_id ?? null}
              source={event.source}
            />
          </div>

          {/* Warm gradient + info text — overlaid on the bottom of the image */}
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "90px 28px 40px",
              textAlign: "center",
              background: "linear-gradient(to top, rgba(14,8,5,1) 0%, rgba(14,8,5,0.93) 28%, rgba(14,8,5,0.6) 50%, rgba(14,8,5,0.15) 70%, transparent 100%)",
              zIndex: 1,
            }}
          >
            <h1
              style={{
                color: "#fff",
                fontSize: 32,
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: "-0.02em",
                margin: "0 0 12px",
                textWrap: "balance",
              } as React.CSSProperties}
            >
              {event.title}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, fontWeight: 500, margin: "0 0 2px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateLine}{timeLine ? ` · ${timeLine}` : ""}
            </p>
            {(venue?.name || address) && (
              <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 14, fontWeight: 500, margin: "0 0 2px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {venue?.name ?? address}
              </p>
            )}
            {venue?.name && address && (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: 0 }}>
                {address}
              </p>
            )}
          </div>
        </div>

        {/* ── Content area — forced dark surface ───────────────────────
             CSS variables are overridden here so every child component
             (ActionBar, CopyInviteLink, AttendeeList, etc.) automatically
             uses dark-appropriate colours without per-component changes.  */}
        <div style={{
          background: "transparent",
          color: "#eae8e4",
          "--border":        "rgba(255,255,255,0.10)",
          "--border-strong": "rgba(255,255,255,0.18)",
          "--btn-bg":        "rgba(255,255,255,0.07)",
          "--btn-bg-active": "rgba(255,255,255,0.13)",
          "--surface-subtle":"rgba(255,255,255,0.04)",
          "--background":    "rgba(20,11,7,0.55)",
          "--foreground":    "#eae8e4",
          "--accent":        "#a78bfa",
        } as React.CSSProperties}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 64px" }}>

            {/* RSVP */}
            <div style={{ paddingTop: 32, paddingBottom: 4 }}>
              <ActionBar
                eventId={id}
                initialCounts={rsvpCounts}
                sourceUrl={null}
                visibility="private"
              />
            </div>

          {/* ④ Guest preview */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, paddingTop: 18, paddingBottom: 18,
              borderBottom: "1px solid var(--border)",
            }}
          >
            {rsvpCounts.going > 0 || rsvpCounts.maybe > 0 ? (
              <AttendeeList
                eventId={id}
                initialAttendees={attendees}
                goingCount={rsvpCounts.going}
                maybeCount={rsvpCounts.maybe}
                avatarSize={36}
              />
            ) : (
              <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet — be the first!</span>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <InviteFriendsButton eventId={id} />
              <ShareButton title={event.title} eventId={id} />
            </div>
          </div>

          {/* ⑤ Activity preview */}
          {recentActivity.length > 0 && (
            <div style={{ paddingTop: 6, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
              {recentActivity.map((item, i) => {
                const label = rsvpActivityLabel(item.response);
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      paddingTop: 10, paddingBottom: 10,
                    }}
                  >
                    {item.userId ? (
                      <Link href={`/profile/${item.userId}`} style={{ flexShrink: 0, lineHeight: 0, display: "flex" }}>
                        {item.avatar_url ? (
                          <img src={item.avatar_url} alt={item.display_name ?? ""} width={28} height={28} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(item.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                            {getInitials(item.display_name)}
                          </div>
                        )}
                      </Link>
                    ) : item.avatar_url ? (
                      <img src={item.avatar_url} alt={item.display_name ?? ""} width={28} height={28} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(item.display_name), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                        {getInitials(item.display_name)}
                      </div>
                    )}
                    <span style={{ fontSize: 13, flex: 1 }}>
                      <strong>{item.display_name ?? "Someone"}</strong>{" "}
                      <span style={{ color: label.color }}>{label.text}</span>
                    </span>
                    <span style={{ fontSize: 12, opacity: 0.35, flexShrink: 0 }}>
                      {relativeTime(item.updated_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ⑥ Hosted by */}
          {creator && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 10,
                paddingTop: 16, paddingBottom: 16,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {creatorId ? (
                <Link href={`/profile/${creatorId}`} style={{ flexShrink: 0, lineHeight: 0, display: "flex" }}>
                  {creator.avatar_url ? (
                    <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                      {getInitials(creator.display_name)}
                    </div>
                  )}
                </Link>
              ) : creator.avatar_url ? (
                <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: getAvatarColor(creator.display_name), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                  {getInitials(creator.display_name)}
                </div>
              )}
              <span style={{ fontSize: 14, opacity: 0.75 }}>
                Hosted by{" "}
                {creatorId ? (
                  <Link
                    href={`/profile/${creatorId}`}
                    style={{ fontWeight: 600, textDecoration: "none", color: "inherit", opacity: 1 }}
                  >
                    {creator.display_name ?? creator.username ?? "a member"}
                  </Link>
                ) : (
                  <strong>{creator.display_name ?? "a member"}</strong>
                )}
              </span>
            </div>
          )}

          {/* ⑦ Description */}
          {event.description && (
            <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                About
              </h2>
              <ExpandableDescription text={event.description} />
            </div>
          )}

          </div>{/* inner maxWidth div */}
        </div>{/* content gradient wrapper */}
        </div>{/* z-index wrapper */}
      </main>
    );
  }

  /* ── Public event: unified layout matching private ─────────────────────── */
  const recentActivity = await fetchRecentActivity(id);
  const price = formatPrice(event.min_price, event.max_price, event.currency);
  const isAnnounced = (event as { status?: string }).status === "announced";
  const venueLat = (venue as { lat?: number | null } | null)?.lat ?? null;
  const venueLng = (venue as { lng?: number | null } | null)?.lng ?? null;
  const mapHref =
    venueLat !== null && venueLng !== null
      ? `/map?eventId=${id}&lat=${venueLat}&lng=${venueLng}`
      : venue?.name
      ? `/map?q=${encodeURIComponent(venue.name)}`
      : "/map";
  const startD = new Date(event.start_at);
  const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
  const dateLine = startD.toLocaleString("en-US", {
    timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
  });
  const timeLine = isUnknownTime ? null : startD.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });

  return (
    <main style={{ padding: 0, position: "relative", minHeight: "100dvh" }}>

      {/* Ambient background: blurred image tones fill the full page */}
      {event.image_url ? (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img
            src={event.image_url}
            alt=""
            width={800}
            height={800}
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(80px) saturate(1.8) brightness(0.38)",
              transform: "scale(1.15)",
              pointerEvents: "none",
            }}
          />
        </div>
      ) : (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, background: "#111110", pointerEvents: "none" }} />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Hero card: full-bleed image with title/date/venue overlay */}
        <div style={{ position: "relative", borderRadius: "0 0 28px 28px", overflow: "hidden" }}>
          {event.image_url ? (
            <img
              src={event.image_url}
              alt=""
              style={{ display: "block", width: "100%", aspectRatio: "3/4", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", aspectRatio: "3/4", background: categoryBg(event.category_primary) }} />
          )}

          {/* Nav controls — float over the top of the image */}
          <div
            style={{
              position: "absolute", top: 20, left: 16, right: 16,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              zIndex: 2,
            }}
          >
            <BackButton
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 40, height: 40, borderRadius: "50%",
                background: "rgba(0,0,0,0.32)",
                border: "1px solid rgba(255,255,255,0.15)",
                cursor: "pointer", color: "#fff", flexShrink: 0,
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </BackButton>
            <EventOwnerActions
              compact
              eventId={id}
              creatorId={(event as { creator_id?: string | null }).creator_id ?? null}
              source={event.source}
            />
          </div>

          {/* Category pill — top-center of the hero image */}
          <div
            style={{
              position: "absolute", top: 20, left: 0, right: 0,
              display: "flex", justifyContent: "center", alignItems: "center",
              pointerEvents: "none", zIndex: 2,
            }}
          >
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: "rgba(255,255,255,0.80)",
              textTransform: "uppercase", letterSpacing: "0.07em",
              padding: "4px 12px", borderRadius: 20,
              background: "rgba(0,0,0,0.35)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.15)",
            }}>
              {CATEGORY_LABELS[event.category_primary] ?? event.category_primary}
            </span>
          </div>

          {/* Gradient + info overlay — price · title · date · venue */}
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "90px 28px 40px",
              textAlign: "center",
              background: "linear-gradient(to top, rgba(14,8,5,1) 0%, rgba(14,8,5,0.93) 28%, rgba(14,8,5,0.6) 50%, rgba(14,8,5,0.15) 70%, transparent 100%)",
              zIndex: 1,
            }}
          >
            {/* Price · announced — small meta row above title */}
            {(price || isAnnounced) && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center", flexWrap: "wrap", marginBottom: 10 }}>
                {price && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>{price}</span>}
                {isAnnounced && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(255,255,255,0.25)", color: "rgba(255,255,255,0.65)" }}>
                    Tickets soon
                  </span>
                )}
              </div>
            )}
            <h1
              style={{
                color: "#fff",
                fontSize: 32, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.02em",
                margin: "0 0 12px", textWrap: "balance",
              } as React.CSSProperties}
            >
              {event.title}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.72)", fontSize: 15, fontWeight: 500, margin: "0 0 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateLine}{timeLine ? ` · ${timeLine}` : ""}
            </p>
            {venue?.name && (
              <Link
                href={mapHref}
                style={{ color: "rgba(255,255,255,0.60)", fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.28)", textUnderlineOffset: 3 }}
              >
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {venue.name}
              </Link>
            )}
          </div>
        </div>

        {/* Content area — dark surface (same CSS variable overrides as private) */}
        <div style={{
          background: "transparent",
          color: "#eae8e4",
          "--border":         "rgba(255,255,255,0.10)",
          "--border-strong":  "rgba(255,255,255,0.18)",
          "--btn-bg":         "rgba(255,255,255,0.07)",
          "--btn-bg-active":  "rgba(255,255,255,0.13)",
          "--surface-subtle": "rgba(255,255,255,0.04)",
          "--background":     "rgba(20,11,7,0.55)",
          "--foreground":     "#eae8e4",
          "--accent":         "#a78bfa",
        } as React.CSSProperties}>
          <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 64px" }}>

            {/* RSVP / Tickets */}
            <div style={{ paddingTop: 32, paddingBottom: 4 }}>
              <ActionBar
                eventId={id}
                initialCounts={rsvpCounts}
                sourceUrl={event.source_url ?? null}
                visibility="public"
              />
            </div>

            {/* Attendees + Share */}
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, paddingTop: 18, paddingBottom: 18,
                borderBottom: "1px solid var(--border)",
              }}
            >
              {rsvpCounts.going > 0 || rsvpCounts.maybe > 0 ? (
                <AttendeeList
                  eventId={id}
                  initialAttendees={attendees}
                  goingCount={rsvpCounts.going}
                  maybeCount={rsvpCounts.maybe}
                  avatarSize={36}
                />
              ) : (
                <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet — be the first!</span>
              )}
              <ShareButton title={event.title} eventId={id} />
            </div>

            {/* Recent activity */}
            {recentActivity.length > 0 && (
              <div style={{ paddingTop: 6, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
                {recentActivity.map((item, i) => {
                  const label = rsvpActivityLabel(item.response);
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        paddingTop: 10, paddingBottom: 10,
                      }}
                    >
                      {item.userId ? (
                        <Link href={`/profile/${item.userId}`} style={{ flexShrink: 0, lineHeight: 0, display: "flex" }}>
                          {item.avatar_url ? (
                            <img src={item.avatar_url} alt={item.display_name ?? ""} width={28} height={28} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(item.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                              {getInitials(item.display_name)}
                            </div>
                          )}
                        </Link>
                      ) : item.avatar_url ? (
                        <img src={item.avatar_url} alt={item.display_name ?? ""} width={28} height={28} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(item.display_name), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                          {getInitials(item.display_name)}
                        </div>
                      )}
                      <span style={{ fontSize: 13, flex: 1 }}>
                        <strong>{item.display_name ?? "Someone"}</strong>{" "}
                        <span style={{ color: label.color }}>{label.text}</span>
                      </span>
                      <span style={{ fontSize: 12, opacity: 0.35, flexShrink: 0 }}>
                        {relativeTime(item.updated_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hosted by */}
            {creator && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  paddingTop: 16, paddingBottom: 16,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {creatorId ? (
                  <Link href={`/profile/${creatorId}`} style={{ flexShrink: 0, lineHeight: 0, display: "flex" }}>
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                        {getInitials(creator.display_name)}
                      </div>
                    )}
                  </Link>
                ) : creator.avatar_url ? (
                  <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={32} height={32} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: getAvatarColor(creator.display_name), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                    {getInitials(creator.display_name)}
                  </div>
                )}
                <span style={{ fontSize: 14, opacity: 0.75 }}>
                  Hosted by{" "}
                  {creatorId ? (
                    <Link
                      href={`/profile/${creatorId}`}
                      style={{ fontWeight: 600, textDecoration: "none", color: "inherit", opacity: 1 }}
                    >
                      {creator.display_name ?? creator.username ?? "a member"}
                    </Link>
                  ) : (
                    <strong>{creator.display_name ?? "a member"}</strong>
                  )}
                </span>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div style={{ paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <h2 style={{ fontSize: 13, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                  About
                </h2>
                <ExpandableDescription text={event.description} />
              </div>
            )}

            {/* Related events — public only */}
            {related.length > 0 && (
              <section style={{ paddingTop: 32 }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>More events like this</h2>
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
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          )}
                          <div
                            style={{
                              position: "absolute", inset: 0,
                              background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)",
                            }}
                          />
                          <div
                            style={{
                              position: "absolute", bottom: 0, left: 0, right: 0,
                              padding: "8px 10px 11px",
                              display: "flex", flexDirection: "column", gap: 2,
                            }}
                          >
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                              {smartDate(r.start_at)}
                            </div>
                            <div
                              style={{
                                fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25,
                                overflow: "hidden",
                                display: "-webkit-box",
                                WebkitLineClamp: edition ? 1 : 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {series}
                            </div>
                            {edition && (
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {edition}
                              </div>
                            )}
                            {rVenue?.name && (
                              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

          </div>{/* inner maxWidth div */}
        </div>{/* content wrapper */}
      </div>{/* z-index wrapper */}
    </main>
  );
}

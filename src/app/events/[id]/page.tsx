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
import { ShareButton, type EventPreview } from "./ShareButton";
import { BackButton } from "./BackButton";
import { PrivateEventSwipePage } from "./PrivateEventSwipePage";
import { BellIcon } from "./CustomIcons";

// cache() deduplicates the DB call so generateMetadata and the page
// component share a single round-trip per request.
const fetchEvent = cache(async (id: string) => {
  const { data } = await supabaseServer()
    .from("events")
    .select(
      "id,title,description,description_title,start_at,end_at,category_primary,status,min_price,max_price,currency,image_url,source_url,source,visibility,creator_id,cohost_ids,spots_mode,spots_limit,price,payment_method,payment_contact,rsvp_deadline,moments_guests_can_post,moments_guests_can_react,profiles!creator_id(display_name,avatar_url,username),venues(name,address_line1,city,lat,lng)"
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
type CohostProfile = { id: string; display_name: string | null; avatar_url: string | null; username: string | null };

async function fetchCohostProfiles(cohostIds: string[]): Promise<CohostProfile[]> {
  if (cohostIds.length === 0) return [];
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id,display_name,avatar_url,username")
    .in("id", cohostIds);
  return (data ?? []) as CohostProfile[];
}

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

  // Host name for invitation framing
  const creatorProfileRaw = Array.isArray(event.profiles) ? event.profiles[0] : event.profiles;
  const hostName =
    (creatorProfileRaw as { display_name?: string | null } | null)?.display_name ?? null;

  // OG title — just the event name; keep it short for messaging apps
  const ogTitle = event.title as string;

  // Venue line
  const venueRaw = Array.isArray(event.venues) ? event.venues[0] : event.venues;
  const venueLine = venueRaw
    ? [(venueRaw as { name?: string | null }).name, (venueRaw as { city?: string | null }).city]
        .filter(Boolean)
        .join(", ")
    : null;

  // Date/time — compact "May 8 · 8:30 PM" format
  const startD = new Date(event.start_at);
  const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
  const datePart = startD.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  });
  const timePart = isUnknownTime
    ? null
    : startD.toLocaleString("en-US", {
        timeZone: "America/Toronto",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
  const dateTimePart = timePart ? `${datePart} · ${timePart}` : datePart;

  // OG description — inviter · date · venue; concise and iMessage-friendly
  const inviterPart = hostName ? `${hostName} invited you` : null;
  const ogDescription =
    [inviterPart, dateTimePart, venueLine].filter(Boolean).join(" · ") || "Discover events on Outsy.";

  // OG image — use event cover if available, otherwise generated gradient card
  const ogImageUrl = event.image_url
    ? (event.image_url as string)
    : `/api/events/${id}/og-image`;

  const ogImage = {
    url: ogImageUrl,
    width: 1200,
    height: 630,
    alt: event.title,
  };

  return {
    title: `${event.title} | Outsy`,
    description: ogDescription,
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      images: [ogImage],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: [ogImageUrl],
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

// Share card date — always "May 8 · 8:30 PM" style (not context-relative)
function shareCardDate(iso: string): string {
  const d = new Date(iso);
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const monthDay = d.toLocaleDateString("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  });
  if (isUnknownTime) return monthDay;
  const timeStr = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${monthDay} · ${timeStr}`;
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


async function fetchMomentsForEvent(eventId: string) {
  const { data } = await supabaseServer()
    .from("moments")
    .select(
      "id,event_id,author_id,body,is_pinned,reactions_enabled,comments_enabled,created_at," +
        "profiles(display_name,avatar_url,username)," +
        "moment_reactions(user_id,emoji)"
    )
    .eq("event_id", eventId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
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

  /* ── Private event: swipe layout ───────────────────────────────────────── */
  if (event.visibility === "private") {
    const venueLat = (venue as { lat?: number | null } | null)?.lat ?? null;
    const venueLng = (venue as { lng?: number | null } | null)?.lng ?? null;
    const venueCoords =
      typeof venueLat === "number" && typeof venueLng === "number"
        ? `&lat=${venueLat}&lng=${venueLng}`
        : "";
    const privateMapHref = venue ? `/map?eventId=${id}${venueCoords}` : null;
    const evtExt = event as {
      cohost_ids?: string[] | null;
      spots_mode?: string | null;
      spots_limit?: number | null;
      price?: number | null;
      payment_method?: string | null;
      payment_contact?: string | null;
      rsvp_deadline?: string | null;
      moments_guests_can_post?: boolean | null;
      moments_guests_can_react?: boolean | null;
      description_title?: string | null;
    };
    const cohostIds = evtExt.cohost_ids ?? [];
    const [cohostProfiles, initialMoments] = await Promise.all([
      fetchCohostProfiles(cohostIds),
      fetchMomentsForEvent(id),
    ]);
    const spotsLimited = evtExt.spots_mode === "limited" && (evtExt.spots_limit ?? 0) > 0;
    const eventPrice = typeof evtExt.price === "number" && evtExt.price > 0 ? evtExt.price : null;
    const eventCurrency = (event as { currency?: string | null }).currency ?? "CAD";
    const rsvpDeadline = evtExt.rsvp_deadline ?? null;
    const guestsCanPost = Boolean(evtExt.moments_guests_can_post ?? false);
    const guestsCanReact = evtExt.moments_guests_can_react !== false;

    const startD = new Date(event.start_at);
    const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
    const dateLine = startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
    });
    const timeLine = isUnknownTime ? null : startD.toLocaleString("en-US", {
      timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
    });

    const privatePreview: EventPreview = {
      imageUrl: (event.image_url as string | null) ?? null,
      category: event.category_primary,
      hostName: creator?.display_name ?? null,
      dateStr: shareCardDate(event.start_at),
      venueName: venue?.name ?? null,
    };

    return (
      <PrivateEventSwipePage
        id={id}
        imageUrl={(event.image_url as string | null) ?? null}
        title={event.title}
        category={event.category_primary}
        source={event.source}
        creatorId={creatorId}
        creator={creator}
        cohostIds={cohostIds}
        cohostProfiles={cohostProfiles}
        dateLine={dateLine}
        timeLine={timeLine}
        privateMapHref={privateMapHref}
        venueName={venue?.name ?? null}
        description={(event.description as string | null) ?? null}
        descriptionTitle={(evtExt.description_title as string | null) ?? null}
        spotsLimited={spotsLimited}
        spotsLimit={evtExt.spots_limit ?? null}
        eventPrice={eventPrice}
        eventCurrency={eventCurrency}
        paymentMethod={evtExt.payment_method ?? null}
        paymentContact={evtExt.payment_contact ?? null}
        rsvpDeadline={rsvpDeadline}
        rsvpCounts={rsvpCounts}
        attendees={attendees}
        guestsCanPost={guestsCanPost}
        guestsCanReact={guestsCanReact}
        initialMoments={initialMoments as never}
        preview={privatePreview}
      />
    );
  }

  /* ── Public event: unified layout matching private ─────────────────────── */
  const price = formatPrice(event.min_price, event.max_price, event.currency);
  const isAnnounced = (event as { status?: string }).status === "announced";
  const pubLat = (venue as { lat?: number | null } | null)?.lat ?? null;
  const pubLng = (venue as { lng?: number | null } | null)?.lng ?? null;
  const pubCoords =
    typeof pubLat === "number" && typeof pubLng === "number"
      ? `&lat=${pubLat}&lng=${pubLng}`
      : "";
  const mapHref = venue ? `/map?eventId=${id}${pubCoords}` : "/map";
  const startD = new Date(event.start_at);
  const isUnknownTime = startD.getUTCHours() === 0 && startD.getUTCMinutes() === 0;
  const dateLine = startD.toLocaleString("en-US", {
    timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
  });
  const timeLine = isUnknownTime ? null : startD.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });

  // Share preview props — shown in the in-app share card
  const sharePreview: EventPreview = {
    imageUrl: (event.image_url as string | null) ?? null,
    category: event.category_primary,
    hostName: creator?.display_name ?? null,
    dateStr: smartDate(event.start_at),
    venueName: venue?.name ?? null,
  };

  return (
    <main style={{
      padding: 0,
      minHeight: "100dvh",
      background: "linear-gradient(to bottom, #0b0f14 52%, #243b55 100%)",
      position: "relative",
    }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", borderRadius: "0 0 50px 50px", overflow: "hidden" }}>
        {event.image_url ? (
          <img
            src={event.image_url}
            alt=""
            style={{ display: "block", width: "100%", aspectRatio: "9/10", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "9/10", background: categoryBg(event.category_primary) }} />
        )}

        {/* Nav controls */}
        <div style={{
          position: "absolute", top: 20, left: 16, right: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 2,
        }}>
          <BackButton style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(18,25,36,0.50)",
            border: "1px solid rgba(255,255,255,0.14)",
            cursor: "pointer", color: "#fff", flexShrink: 0,
            touchAction: "manipulation",
          }}>
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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

        {/* Category pill */}
        <div style={{
          position: "absolute", top: 20, left: 0, right: 0,
          display: "flex", justifyContent: "center", alignItems: "center",
          pointerEvents: "none", zIndex: 2,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: "rgba(255,255,255,0.80)",
            textTransform: "uppercase", letterSpacing: "0.07em",
            padding: "4px 12px", borderRadius: 20,
            background: "rgba(0,0,0,0.50)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}>
            {CATEGORY_LABELS[event.category_primary] ?? event.category_primary}
          </span>
        </div>

        {/* Gradient scrim + title / date / venue */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "80px 24px 32px",
          textAlign: "center",
          background: "linear-gradient(to top, rgba(11,15,20,1) 0%, rgba(11,15,20,0.93) 25%, rgba(11,15,20,0.55) 50%, transparent 100%)",
          zIndex: 1,
        }}>
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
          <h1 style={{
            color: "#f5f7fa",
            fontSize: 26, fontWeight: 800,
            lineHeight: 1.2, letterSpacing: "-0.02em",
            margin: "0 0 8px",
            textWrap: "balance",
            textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
          } as React.CSSProperties}>
            {event.title}
          </h1>
          <p style={{
            color: "#f5f7fa", fontSize: 13, fontWeight: 500,
            margin: "0 0 4px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
          }}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
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
              style={{
                color: "#f5f7fa", fontSize: 13, fontWeight: 500, opacity: 0.80,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.30)",
                textUnderlineOffset: 3,
                textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
              }}
            >
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venue.name}
            </Link>
          )}
        </div>
      </div>

      {/* ── PAGE DOT ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "14px 0 18px" }}>
        <div style={{ width: 21, height: 7, borderRadius: 20, background: "#ffffff" }} />
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────────────── */}
      <div style={{
        "--border":         "rgba(255,255,255,0.10)",
        "--border-strong":  "rgba(255,255,255,0.18)",
        "--btn-bg":         "rgba(18,25,36,0.55)",
        "--btn-bg-active":  "rgba(255,255,255,0.13)",
        "--surface-subtle": "rgba(255,255,255,0.04)",
        "--background":     "rgba(18,25,36,0.55)",
        "--foreground":     "#f5f7fa",
        "--accent":         "#5EA8FF",
        color: "#f5f7fa",
      } as React.CSSProperties}>
        <div style={{ padding: "10px 20px 48px" }}>

          {/* RSVP / Tickets */}
          <ActionBar
            eventId={id}
            initialCounts={rsvpCounts}
            sourceUrl={event.source_url ?? null}
            visibility="public"
          />

          {/* ── ATTENDEES ROW ──────────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 12, padding: "18px 0 16px",
          }}>
            {rsvpCounts.going > 0 || rsvpCounts.maybe > 0 ? (
              <AttendeeList
                eventId={id}
                initialAttendees={attendees}
                goingCount={rsvpCounts.going}
                maybeCount={rsvpCounts.maybe}
                avatarSize={28}
              />
            ) : (
              <span style={{ fontSize: 12, opacity: 0.45 }}>No guests yet — be first!</span>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <ShareButton title={event.title} eventId={id} preview={sharePreview} />
              <button type="button" style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(18,25,36,0.20)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#f5f7fa", cursor: "pointer", flexShrink: 0,
                padding: 0,
              }} aria-label="Notifications">
                <BellIcon size={18} />
              </button>
            </div>
          </div>

          {/* ── ORGANIZED BY CARD ─────────────────────────────────────────── */}
          {creator && (
            <div style={{
              borderRadius: 20,
              background: "rgba(18,25,36,0.14)",
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "16px",
            }}>
              <p style={{
                fontSize: 14, fontWeight: 600, color: "#f5f7fa",
                textAlign: "center", margin: "0 0 12px",
              }}>
                Organized by
              </p>

              <div style={{ display: "flex", justifyContent: "center", marginBottom: event.description ? 14 : 0 }}>
                {creatorId ? (
                  <Link href={`/profile/${creatorId}`} style={{ lineHeight: 0, display: "block", textDecoration: "none" }}>
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={28} height={28}
                        style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(18,25,36,0.85)", display: "block" }} />
                    ) : (
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(18,25,36,0.85)" }}>
                        {getInitials(creator.display_name)}
                      </div>
                    )}
                  </Link>
                ) : creator.avatar_url ? (
                  <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={28} height={28}
                    style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(18,25,36,0.85)", display: "block" }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(18,25,36,0.85)" }}>
                    {getInitials(creator.display_name)}
                  </div>
                )}
              </div>

              {event.description && (
                <>
                  <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "0 0 14px" }} />
                  {(event as { description_title?: string | null }).description_title && (
                    <p style={{ fontSize: 14, fontWeight: 600, textAlign: "center", margin: "0 0 6px", color: "#f5f7fa" }}>
                      {(event as { description_title?: string | null }).description_title}
                    </p>
                  )}
                  <div style={{ fontSize: 13, color: "#ffffff", textAlign: "center", lineHeight: 1.55 }}>
                    <ExpandableDescription text={event.description} />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── RELATED EVENTS ────────────────────────────────────────────── */}
          {related.length > 0 && (
            <section style={{ paddingTop: 32 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>More events like this</h2>
              <div style={{
                display: "flex",
                gap: 10,
                overflowX: "auto",
                scrollbarWidth: "none",
                paddingBottom: 4,
              }}>
                {related.map((r) => {
                  const rVenue = Array.isArray(r.venues) ? r.venues[0] : r.venues;
                  const { series, edition } = splitSeriesTitle(r.title);
                  return (
                    <Link
                      key={r.id}
                      href={`/events/${r.id}`}
                      style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}
                    >
                      <div style={{
                        position: "relative",
                        width: 190,
                        height: 220,
                        borderRadius: 12,
                        overflow: "hidden",
                        background: categoryBg(r.category_primary),
                      }}>
                        {r.image_url && (
                          <img
                            src={r.image_url}
                            alt=""
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                        <div style={{
                          position: "absolute", inset: 0,
                          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)",
                        }} />
                        <div style={{
                          position: "absolute", bottom: 0, left: 0, right: 0,
                          padding: "8px 10px 11px",
                          display: "flex", flexDirection: "column", gap: 2,
                        }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                            {smartDate(r.start_at)}
                          </div>
                          <div style={{
                            fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: edition ? 1 : 2,
                            WebkitBoxOrient: "vertical",
                          }}>
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

        </div>
      </div>
    </main>
  );
}

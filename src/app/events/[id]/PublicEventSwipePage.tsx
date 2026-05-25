/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useTileTransition } from "../../components/TileTransitionProvider";
import { BackButton } from "./BackButton";
import { EventOwnerActions } from "./EventOwnerActions";
import { AttendeeList } from "./AttendeeList";
import { type EventPreview } from "./ShareButton";
import { MomentsClient } from "./moments/MomentsClient";
import type { MomentRow } from "./moments/page";
import { EventBody } from "./EventBody";
import { useAuth } from "../../components/AuthProvider";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}


function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts": case "music":   return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":                return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": case "art": return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":                   return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":                   return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":                   return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:                         return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const toKey = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const eventDay = toKey(d);
  const today = toKey(now);
  const tomorrow = toKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const timeStr = isUnknownTime ? "" : " at " + rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();
  if (eventDay === today)    return `Today${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow${timeStr}`;
  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    const weekday = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "long" });
    return `${weekday}${timeStr}`;
  }
  const monthDay = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" });
  return `${monthDay}${timeStr}`;
}

function splitSeriesTitle(title: string): { series: string; edition: string | null } {
  const seps = [" - ", " – ", " | ", " : ", " with ", " feat. ", " ft. ", " featuring "];
  const lower = title.toLowerCase();
  for (const sep of seps) {
    const idx = lower.indexOf(sep);
    if (idx > 0) return { series: title.slice(0, idx).trim(), edition: title.slice(idx + sep.length).trim() || null };
  }
  return { series: title, edition: null };
}

const CATEGORY_LABELS: Record<string, string> = {
  concerts: "Concerts", nightlife: "Nightlife", arts_culture: "Arts & Culture",
  comedy: "Comedy", sports: "Sports", family: "Family",
  music: "Concerts", art: "Arts & Culture",
};

// ── Types ──────────────────────────────────────────────────────────────────────

type Attendee = { display_name: string | null; avatar_url: string | null };

type RelatedEvent = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  image_url: string | null;
  venues: { name: string | null; city: string | null } | { name: string | null; city: string | null }[] | null;
};

type Props = {
  id: string;
  imageUrl: string | null;
  title: string;
  category: string;
  source: string;
  creatorId: string | null;
  creator: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null; username: string | null } | null;
  cohostIds: string[];
  dateLine: string;
  timeLine: string | null;
  mapHref: string;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueLat: number | null;
  venueLng: number | null;
  description: string | null;
  descriptionTitle: string | null;
  price: string | null;
  isAnnounced: boolean;
  rsvpCounts: { going: number; maybe: number; cant_go: number };
  attendees: Attendee[];
  related: RelatedEvent[];
  sourceUrl: string | null;
  organizers: { name: string; role: string; slug: string | null; image_url: string | null; custom_image_url: string | null }[];
  eventOrganizerIds?: string[];
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  startAt: string;
  // Details section
  spotsLimited: boolean;
  spotsLimit: number | null;
  eventPrice: number | null;
  eventCurrency: string;
  paymentMethod: string | null;
  rsvpDeadline: string | null;
  preview?: EventPreview;
  previewMode?: boolean;
  onPreviewBack?: () => void;
  onPublish?: () => void;
  previewSubmitting?: boolean;
  previewError?: string | null;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PublicEventSwipePage(props: Props) {
  const { session } = useAuth();
  const {
    id, imageUrl, title, category, source,
    creatorId, creator, cohostIds,
    dateLine, timeLine, mapHref, venueName,
    venueAddress, venueCity, venueLat, venueLng,
    description, descriptionTitle,
    price, isAnnounced,
    rsvpCounts, attendees, related,
    sourceUrl,
    organizers,
    eventOrganizerIds = [],
    guestsCanPost, guestsCanReact,
    initialMoments,
    startAt,
    spotsLimited, spotsLimit,
    eventPrice, eventCurrency, paymentMethod, rsvpDeadline,
    previewMode = false,
    onPreviewBack,
    onPublish,
    previewSubmitting = false,
    previewError = null,
  } = props;

  // Hero entry animation — start hidden if a tile transition is in progress,
  // then reveal as the expansion overlay fades out.
  const { isTransitioning } = useTileTransition();
  const [heroVisible, setHeroVisible] = useState(!isTransitioning);
  useEffect(() => {
    if (!isTransitioning && !heroVisible) {
      setHeroVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning]);

  // Compute share preview client-side from startAt
  const sharePreview: EventPreview = {
    imageUrl,
    category,
    hostName: creator?.display_name ?? null,
    dateStr: smartDate(startAt),
    venueName,
  };

  return (
    <main style={{
      padding: 0,
      minHeight: "100dvh",
      background: "linear-gradient(to bottom, #0b0f14 52%, #243b55 100%)",
      position: "relative",
    }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <div style={{
        position: "relative",
        borderRadius: "0 0 50px 50px",
        overflow: "hidden",
        opacity: heroVisible ? 1 : 0,
        transition: heroVisible ? "opacity 0.28s ease-out" : "none",
      }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            style={{ display: "block", width: "100%", aspectRatio: "9/10", objectFit: "cover" }}
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "9/10", background: categoryBg(category) }} />
        )}

        {/* Nav controls — back | category pill | menu */}
        <div style={{
          position: "absolute", top: 20, left: 16, right: 16,
          display: "flex", alignItems: "center",
          zIndex: 2,
        }}>
          <BackButton
            onClick={previewMode ? onPreviewBack : undefined}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 39, height: 39, borderRadius: "50%",
              background: "rgba(18,25,36,0.50)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              cursor: "pointer", color: "#fff", flexShrink: 0,
              touchAction: "manipulation",
            } as React.CSSProperties}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -1 }}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </BackButton>

          <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
            <span style={{
              fontSize: 11, fontWeight: 700,
              color: "rgba(255,255,255,0.85)",
              textTransform: "uppercase", letterSpacing: "0.07em",
              padding: "5px 14px", borderRadius: 20,
              background: "rgba(18,25,36,0.50)",
              border: "1px solid rgba(255,255,255,0.14)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            } as React.CSSProperties}>
              {CATEGORY_LABELS[category] ?? category}
            </span>
          </div>

          {previewMode ? (
            <button
              type="button"
              disabled={previewSubmitting}
              onClick={onPublish}
              style={{
                height: 33, padding: "0 18px", borderRadius: 20,
                background: previewSubmitting ? "rgba(255,255,255,0.55)" : "#ffffff",
                border: "none",
                color: "#0b0f14", fontWeight: 700, fontSize: 13,
                cursor: previewSubmitting ? "not-allowed" : "pointer", flexShrink: 0,
              }}
            >
              {previewSubmitting ? "Publishing…" : "Publish"}
            </button>
          ) : (
            <EventOwnerActions compact eventId={id} creatorId={creatorId} source={source} eventOrganizerIds={eventOrganizerIds} />
          )}
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
            {title}
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
          {venueName && (
            <Link href={mapHref} style={{
              color: "#f5f7fa", fontSize: 13, fontWeight: 500, opacity: 0.80,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.30)",
              textUnderlineOffset: 3,
              textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
            }}>
              <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {venueName}
            </Link>
          )}
        </div>
      </div>

      {/* ── PREVIEW ERROR BANNER ──────────────────────────────────────────── */}
      {previewMode && previewError && (
        <div style={{
          margin: "12px 20px 0",
          padding: "10px 14px",
          borderRadius: 12,
          background: "rgba(220,38,38,0.15)",
          border: "1px solid rgba(220,38,38,0.35)",
          color: "#fca5a5",
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.4,
        }}>
          {previewError}
        </div>
      )}

      {/* ── EVENT BODY ────────────────────────────────────────────────────── */}
      <EventBody
        eventId={id}
        eventTitle={title}
        category={category}
        visibility="public"
        isHostOrCohost={false}
        previewMode={previewMode}
        sharePreview={sharePreview}
        initialRsvpCounts={rsvpCounts}
        sourceUrl={sourceUrl}
        attendees={attendees}
        creatorId={creatorId}
        creator={creator}
        cohostIds={cohostIds}
        spotsLimited={spotsLimited}
        spotsLimit={spotsLimit}
        description={description}
        descriptionTitle={descriptionTitle}
        organizers={organizers}
        venueName={venueName}
        venueAddress={venueAddress}
        venueCity={venueCity}
        venueLat={venueLat}
        venueLng={venueLng}
        mapHref={mapHref}
        eventPrice={eventPrice}
        eventCurrency={eventCurrency}
        paymentMethod={paymentMethod}
        paymentContact={null}
        rsvpDeadline={rsvpDeadline}
        guestsCanPost={guestsCanPost}
        guestsCanReact={guestsCanReact}
        initialMoments={initialMoments}
        eventOrganizerIds={eventOrganizerIds}
        relatedEventsNode={related.length > 0 ? (
          <section style={{ padding: "0 20px 80px" }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, color: "#f5f7fa" }}>More events like this</h2>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", scrollbarWidth: "none", paddingBottom: 4 }}>
              {related.map((r) => {
                const rVenue = Array.isArray(r.venues) ? r.venues[0] : r.venues;
                const { series, edition } = splitSeriesTitle(r.title);
                return (
                  <Link key={r.id} href={`/events/${r.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}>
                    <div style={{ position: "relative", width: 190, height: 220, borderRadius: 12, overflow: "hidden", background: categoryBg(r.category_primary) }}>
                      {r.image_url && (
                        <img src={r.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 10px 11px", display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(r.start_at)}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: edition ? 1 : 2, WebkitBoxOrient: "vertical" }}>
                          {series}
                        </div>
                        {edition && (
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edition}</div>
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
        ) : undefined}
      />

      {/* Hidden AttendeeList — keeps guest-list modal functional via outsy:open-guest-list event */}
      <div style={{ display: "none" }}>
        <AttendeeList
          eventId={id}
          initialAttendees={attendees}
          goingCount={rsvpCounts.going}
          maybeCount={rsvpCounts.maybe}
          cantGoCount={rsvpCounts.cant_go}
          visibility="public"
          token={session?.access_token ?? null}
          creatorId={creatorId}
          creator={creator}
        />
      </div>

    </main>
  );
}

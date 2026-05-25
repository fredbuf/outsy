/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useActiveOrganizer } from "../../components/ActiveOrganizerContext";
import { useTileTransition } from "../../components/TileTransitionProvider";
import { isEventHostOrCohost } from "@/lib/event-ownership";
import { BackButton } from "./BackButton";
import { EventOwnerActions } from "./EventOwnerActions";
import { AttendeeList } from "./AttendeeList";
import { type EventPreview } from "./ShareButton";
import { MomentsClient } from "./moments/MomentsClient";
import type { MomentRow } from "./moments/page";
import { EventBody } from "./EventBody";

// ── Types ──────────────────────────────────────────────────────────────────────

type CohostProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};

type Attendee = { display_name: string | null; avatar_url: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  id: string;
  imageUrl: string | null;
  title: string;
  category: string;
  source: string;
  creatorId: string | null;
  creator: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null; username: string | null } | null;
  cohostIds: string[];
  cohostProfiles: CohostProfile[];
  eventOrganizerIds?: string[];
  organizers?: { name: string; role: string; slug: string | null; image_url: string | null; custom_image_url: string | null }[];
  dateLine: string;
  timeLine: string | null;
  privateMapHref: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueLat: number | null;
  venueLng: number | null;
  description: string | null;
  descriptionTitle: string | null;
  spotsLimited: boolean;
  spotsLimit: number | null;
  eventPrice: number | null;
  eventCurrency: string;
  paymentMethod: string | null;
  paymentContact: string | null;
  rsvpDeadline: string | null;
  rsvpCounts: { going: number; maybe: number; cant_go: number };
  attendees: Attendee[];
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  preview?: EventPreview;
  previewMode?: boolean;
  onPreviewBack?: () => void;
  onPublish?: () => void;
  previewSubmitting?: boolean;
  previewError?: string | null;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PrivateEventSwipePage(props: Props) {
  const {
    id, imageUrl, title, category, source,
    creatorId, creator, cohostIds, cohostProfiles, eventOrganizerIds = [], organizers = [],
    dateLine, timeLine, privateMapHref, venueName, venueAddress, venueCity, venueLat, venueLng,
    description, descriptionTitle,
    spotsLimited, spotsLimit, eventPrice, eventCurrency,
    paymentMethod, paymentContact, rsvpDeadline,
    rsvpCounts, attendees,
    guestsCanPost, guestsCanReact, initialMoments,
    preview,
    previewMode = false,
    onPreviewBack,
    onPublish,
    previewSubmitting = false,
    previewError = null,
  } = props;

  const { user, session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();
  const isHostOrCohost = !previewMode && isEventHostOrCohost({
    userId: user?.id ?? null,
    activeOrganizerId: activeOrganizer?.organizerId ?? null,
    creatorId,
    eventOrganizerIds,
    cohostIds,
  });

  // Hero entry animation — mirrors PublicEventSwipePage
  const { isTransitioning } = useTileTransition();
  const [heroVisible, setHeroVisible] = useState(!isTransitioning);
  useEffect(() => {
    if (!isTransitioning && !heroVisible) {
      setHeroVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTransitioning]);

  return (
    // The page background IS the unified surface — a single gradient from near-black
    // at the top to a deep blue at the bottom, matching the Figma design system.
    <main style={{
      padding: 0,
      minHeight: "100dvh",
      background: "linear-gradient(to bottom, #0b0f14 52%, #243b55 100%)",
      position: "relative",
    }}>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      {/* 9/10 aspect ratio, large bottom-radius — no gap to content below   */}
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
          <div style={{
            width: "100%", aspectRatio: "9/10",
            background: (() => {
              switch (category) {
                case "concerts": case "music":   return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
                case "nightlife":                return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
                case "arts_culture": case "art": return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
                case "comedy":                   return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
                case "sports":                   return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
                case "family":                   return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
                default:                         return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
              }
            })(),
          }} />
        )}

        {/* Nav buttons */}
        <div style={{
          position: "absolute", top: 20, left: 16, right: 16,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 2,
        }}>
          <BackButton
            onClick={previewMode ? onPreviewBack : undefined}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 39, height: 39, borderRadius: "50%",
              background: "rgba(18,25,36,0.50)",
              border: "1px solid rgba(255,255,255,0.14)",
              cursor: "pointer", color: "#fff", flexShrink: 0,
              touchAction: "manipulation",
            }}
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: -1 }}>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </BackButton>
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
            privateMapHref ? (
              <Link href={privateMapHref} style={{
                color: "#f5f7fa", fontSize: 13, fontWeight: 500, opacity: 0.80,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.30)",
                textUnderlineOffset: 3,
                textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
              }}>
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {venueName}
              </Link>
            ) : (
              <p style={{
                color: "#f5f7fa", fontSize: 13, fontWeight: 500, opacity: 0.80,
                margin: 0,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                textShadow: "0px 4px 30px rgba(0,0,0,0.9)",
              }}>
                <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7, flexShrink: 0 }}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {venueName}
              </p>
            )
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
        visibility="private"
        isHostOrCohost={isHostOrCohost}
        previewMode={previewMode}
        sharePreview={preview}
        initialRsvpCounts={rsvpCounts}
        sourceUrl={null}
        attendees={attendees}
        creatorId={creatorId}
        creator={creator}
        cohostIds={cohostIds}
        cohostProfiles={cohostProfiles}
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
        mapHref={privateMapHref}
        eventPrice={eventPrice}
        eventCurrency={eventCurrency}
        paymentMethod={paymentMethod}
        paymentContact={paymentContact}
        rsvpDeadline={rsvpDeadline}
        guestsCanPost={guestsCanPost}
        guestsCanReact={guestsCanReact}
        initialMoments={initialMoments}
        eventOrganizerIds={eventOrganizerIds}
      />

      {/* Hidden AttendeeList — keeps guest-list modal functional via outsy:open-guest-list event */}
      <div style={{ display: "none" }}>
        <AttendeeList
          eventId={id}
          initialAttendees={attendees}
          goingCount={rsvpCounts.going}
          maybeCount={rsvpCounts.maybe}
          cantGoCount={rsvpCounts.cant_go}
          visibility="private"
          token={session?.access_token ?? null}
          creatorId={creatorId}
          creator={creator}
          cohostProfiles={cohostProfiles}
        />
      </div>

    </main>
  );
}

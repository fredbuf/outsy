/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BackButton } from "./BackButton";
import { EventOwnerActions } from "./EventOwnerActions";
import { PrivateActionArea } from "./PrivateActionArea";
import type { EventPreview } from "./ShareButton";
import { PaymentReveal } from "./PaymentReveal";
import { ExpandableDescription } from "./ExpandableDescription";
import { MomentsClient } from "./moments/MomentsClient";
import type { MomentRow } from "./moments/page";

// ── Types ──────────────────────────────────────────────────────────────────────

type CohostProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};

type Attendee = { display_name: string | null; avatar_url: string | null };

// ── Helpers ────────────────────────────────────────────────────────────────────

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

// ── Props ──────────────────────────────────────────────────────────────────────

type Props = {
  id: string;
  imageUrl: string | null;
  title: string;
  category: string;
  source: string;
  creatorId: string | null;
  creator: { display_name: string | null; avatar_url: string | null; username: string | null } | null;
  cohostIds: string[];
  cohostProfiles: CohostProfile[];
  dateLine: string;
  timeLine: string | null;
  privateMapHref: string | null;
  venueName: string | null;
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
  // Moments
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  // Share preview
  preview?: EventPreview;
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PrivateEventSwipePage(props: Props) {
  const {
    id, imageUrl, title, category, source,
    creatorId, creator, cohostIds, cohostProfiles,
    dateLine, timeLine, privateMapHref, venueName, description, descriptionTitle,
    spotsLimited, spotsLimit, eventPrice, eventCurrency,
    paymentMethod, paymentContact, rsvpDeadline,
    rsvpCounts, attendees,
    guestsCanPost, guestsCanReact, initialMoments,
    preview,
  } = props;

  const [page, setPage] = useState(0); // 0 = info, 1 = moments
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const infoPanelRef = useRef<HTMLDivElement>(null);
  const momentsPanelRef = useRef<HTMLDivElement>(null);
  const [clipHeight, setClipHeight] = useState<number | undefined>(undefined);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    // Only trigger on clearly horizontal swipes
    if (Math.abs(dx) > Math.abs(dy) * 1.2 && Math.abs(dx) > 55) {
      if (dx < 0 && page === 0) {
        setPage(1);
      } else if (dx > 0 && page === 1) {
        setPage(0);
      }
    }
    touchStartX.current = null;
    touchStartY.current = null;
  }

  // Keep clip container height locked to the active panel so the inactive
  // panel (which is off-screen) never inflates the page height.
  useEffect(() => {
    const panel = page === 0 ? infoPanelRef.current : momentsPanelRef.current;
    if (!panel) return;
    setClipHeight(panel.scrollHeight);
    const ro = new ResizeObserver(() => setClipHeight(panel.scrollHeight));
    ro.observe(panel);
    return () => ro.disconnect();
  }, [page]);

  const cssVars = {
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
  } as React.CSSProperties;

  return (
    <main style={{ padding: 0, position: "relative", minHeight: "100dvh" }}>

      {/* Ambient background */}
      {imageUrl ? (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(60px) saturate(1.6) brightness(0.35)",
              transform: "scale(1.12)",
              pointerEvents: "none",
              willChange: "transform",
            }}
          />
        </div>
      ) : (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, background: "#111110", pointerEvents: "none" }} />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Hero card — always visible ──────────────────────────────────── */}
        <div style={{ position: "relative", borderRadius: "0 0 50px 50px", overflow: "hidden" }}>
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              style={{ display: "block", width: "100%", aspectRatio: "3/4", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%", aspectRatio: "3/4",
                background: (() => {
                  switch (category) {
                    case "concerts": case "music":  return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
                    case "nightlife":               return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
                    case "arts_culture": case "art": return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
                    case "comedy":                  return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
                    case "sports":                  return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
                    case "family":                  return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
                    default:                        return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
                  }
                })(),
              }}
            />
          )}

          {/* Nav controls */}
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
                width: 34, height: 34, borderRadius: "50%",
                background: "rgba(18,25,36,0.5)",
                border: "1px solid rgba(255,255,255,0.14)",
                cursor: "pointer", color: "#fff", flexShrink: 0,
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </BackButton>
            <EventOwnerActions
              compact
              eventId={id}
              creatorId={creatorId}
              source={source}
            />
          </div>

          {/* Gradient + info overlay */}
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              padding: "90px 28px 40px",
              textAlign: "center",
              background: "linear-gradient(to top, rgba(11,15,20,1) 0%, rgba(11,15,20,0.93) 28%, rgba(11,15,20,0.6) 50%, rgba(11,15,20,0.15) 70%, transparent 100%)",
              zIndex: 1,
            }}
          >
            <h1
              style={{
                color: "#fff", fontSize: 26, fontWeight: 800,
                lineHeight: 1.2, letterSpacing: "-0.02em",
                margin: "0 0 10px", textWrap: "balance",
                textShadow: "0 1px 8px rgba(0,0,0,0.5)",
              } as React.CSSProperties}
            >
              {title}
            </h1>
            <p style={{ color: "rgba(255,255,255,0.80)", fontSize: 13, fontWeight: 500, margin: "0 0 2px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateLine}{timeLine ? ` · ${timeLine}` : ""}
            </p>
            {venueName && (
              privateMapHref ? (
                <Link
                  href={privateMapHref}
                  style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.28)", textUnderlineOffset: 3 }}
                >
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {venueName}
                </Link>
              ) : (
                <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {venueName}
                </p>
              )
            )}
          </div>
        </div>

        {/* ── Page indicator dots ──────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 7, padding: "14px 0 6px" }}>
          <button
            type="button"
            aria-label="Info"
            onClick={() => setPage(0)}
            style={{
              width: page === 0 ? 21 : 8, height: 7,
              borderRadius: 4,
              background: page === 0 ? "#ffffff" : "rgba(255,255,255,0.30)",
              border: "none", padding: 0, cursor: "pointer",
              transition: "width 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.25s ease",
            }}
          />
          <button
            type="button"
            aria-label="Moments"
            onClick={() => setPage(1)}
            style={{
              width: page === 1 ? 21 : 8, height: 7,
              borderRadius: 4,
              background: page === 1 ? "#ffffff" : "rgba(255,255,255,0.30)",
              border: "none", padding: 0, cursor: "pointer",
              transition: "width 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.25s ease",
            }}
          />
        </div>

        {/* ── Swipeable content panels ─────────────────────────────────────── */}
        <div style={cssVars}>
          <div
            style={{
              overflow: "hidden",
              height: clipHeight,
              transition: "height 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                width: "200%",
                transform: `translateX(${page === 0 ? "0%" : "-50%"})`,
                transition: "transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                willChange: "transform",
              }}
            >
              {/* ── Info panel ───────────────────────────────────────────── */}
              <div ref={infoPanelRef} style={{ width: "50%", boxSizing: "border-box" }}>
                <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 120px" }}>

                  {/* RSVP / host controls */}
                  <PrivateActionArea
                    eventId={id}
                    eventTitle={title}
                    creatorId={creatorId}
                    cohostIds={cohostIds}
                    initialCounts={rsvpCounts}
                    initialAttendees={attendees}
                    preview={preview}
                  />

                  {/* Hosting card */}
                  {creator && (
                    <div
                      style={{
                        marginTop: 4, borderRadius: 20,
                        background: "rgba(18,25,36,0.14)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        padding: "14px 16px",
                        textAlign: "center",
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>
                        Hosted by
                      </p>
                      <div style={{ display: "flex", justifyContent: "center" }}>
                        {creatorId ? (
                          <Link
                            href={`/profile/${creatorId}`}
                            style={{ lineHeight: 0, display: "block", textDecoration: "none", position: "relative", zIndex: cohostProfiles.length + 1 }}
                          >
                            {creator.avatar_url ? (
                              <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(20,11,7,0.9)", display: "block" }} />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(20,11,7,0.9)" }}>
                                {getInitials(creator.display_name)}
                              </div>
                            )}
                          </Link>
                        ) : creator.avatar_url ? (
                          <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(20,11,7,0.9)", display: "block", position: "relative", zIndex: cohostProfiles.length + 1 }} />
                        ) : (
                          <div style={{ width: 40, height: 40, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(20,11,7,0.9)", position: "relative", zIndex: cohostProfiles.length + 1 }}>
                            {getInitials(creator.display_name)}
                          </div>
                        )}
                        {cohostProfiles.map((cp, i) => (
                          <Link
                            key={cp.id}
                            href={`/profile/${cp.id}`}
                            style={{ lineHeight: 0, display: "block", textDecoration: "none", marginLeft: -10, position: "relative", zIndex: cohostProfiles.length - i }}
                          >
                            {cp.avatar_url ? (
                              <img src={cp.avatar_url} alt={cp.display_name ?? ""} width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(20,11,7,0.9)", display: "block" }} />
                            ) : (
                              <div style={{ width: 40, height: 40, borderRadius: "50%", background: getAvatarColor(cp.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(20,11,7,0.9)" }}>
                                {getInitials(cp.display_name)}
                              </div>
                            )}
                          </Link>
                        ))}
                      </div>
                      {/* Description */}
                      {description && (
                        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)", textAlign: "center" }}>
                          {descriptionTitle && (
                            <p style={{ fontSize: 17, fontWeight: 600, textAlign: "center", margin: "0 0 10px" }}>
                              {descriptionTitle}
                            </p>
                          )}
                          <ExpandableDescription text={description} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Details card */}
                  {(spotsLimited || eventPrice !== null || rsvpDeadline) && (
                    <div
                      style={{
                        marginTop: 10, borderRadius: 20,
                        background: "rgba(18,25,36,0.14)",
                        border: "1px solid rgba(255,255,255,0.12)",
                        padding: "14px 16px",
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px", textAlign: "center" }}>
                        Details
                      </p>
                      <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
                        {spotsLimited && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 14 }}>
                            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            <span>{spotsLimit} spots available</span>
                          </div>
                        )}
                        {eventPrice !== null && (
                          <PaymentReveal
                            price={eventPrice}
                            currency={eventCurrency}
                            paymentMethod={paymentMethod}
                            paymentContact={paymentContact}
                          />
                        )}
                        {rsvpDeadline && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 14 }}>
                            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                            </svg>
                            <span>
                              {`RSVP by ${(() => {
                                const [y, m, d] = rsvpDeadline.split("-").map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                              })()}`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* ── Moments panel ────────────────────────────────────────── */}
              <div ref={momentsPanelRef} style={{ width: "50%", boxSizing: "border-box" }}>
                <MomentsClient
                  embedded
                  eventId={id}
                  eventTitle={title}
                  eventImageUrl={imageUrl}
                  eventCategory={category}
                  creatorId={creatorId}
                  cohostIds={cohostIds}
                  guestsCanPost={guestsCanPost}
                  guestsCanReact={guestsCanReact}
                  initialMoments={initialMoments}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

    </main>
  );
}

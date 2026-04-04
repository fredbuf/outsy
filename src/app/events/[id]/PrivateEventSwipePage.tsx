/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BackButton } from "./BackButton";
import { EventOwnerActions } from "./EventOwnerActions";
import { PrivateActionArea } from "./PrivateActionArea";
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

type RecentActivityItem = {
  response: "going" | "maybe" | "cant_go";
  updated_at: string;
  display_name: string | null;
  avatar_url: string | null;
  userId: string | null;
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
  if (r === "going") return { text: "is going", color: "#10b981" };
  if (r === "maybe") return { text: "might go", color: "#f59e0b" };
  return { text: "can't make it", color: "#ef4444" };
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
  spotsLimited: boolean;
  spotsLimit: number | null;
  eventPrice: number | null;
  eventCurrency: string;
  paymentMethod: string | null;
  paymentContact: string | null;
  rsvpDeadline: string | null;
  recentActivity: RecentActivityItem[];
  rsvpCounts: { going: number; maybe: number; cant_go: number };
  attendees: Attendee[];
  // Moments
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PrivateEventSwipePage(props: Props) {
  const {
    id, imageUrl, title, category, source,
    creatorId, creator, cohostIds, cohostProfiles,
    dateLine, timeLine, privateMapHref, venueName, description,
    spotsLimited, spotsLimit, eventPrice, eventCurrency,
    paymentMethod, paymentContact, rsvpDeadline,
    recentActivity, rsvpCounts, attendees,
    guestsCanPost, guestsCanReact, initialMoments,
  } = props;

  const [page, setPage] = useState(0); // 0 = info, 1 = moments
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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

        {/* ── Hero card — always visible ──────────────────────────────────── */}
        <div style={{ position: "relative", borderRadius: "0 0 28px 28px", overflow: "hidden" }}>
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
              background: "linear-gradient(to top, rgba(14,8,5,1) 0%, rgba(14,8,5,0.93) 28%, rgba(14,8,5,0.6) 50%, rgba(14,8,5,0.15) 70%, transparent 100%)",
              zIndex: 1,
            }}
          >
            <h1
              style={{
                color: "#fff", fontSize: 32, fontWeight: 800,
                lineHeight: 1.15, letterSpacing: "-0.02em",
                margin: "0 0 12px", textWrap: "balance",
              } as React.CSSProperties}
            >
              {title}
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
            {venueName && (
              privateMapHref ? (
                <Link
                  href={privateMapHref}
                  style={{ color: "rgba(255,255,255,0.60)", fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.28)", textUnderlineOffset: 3 }}
                >
                  <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  {venueName}
                </Link>
              ) : (
                <p style={{ color: "rgba(255,255,255,0.60)", fontSize: 14, fontWeight: 500, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
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

        {/* ── Swipeable content panels ─────────────────────────────────────── */}
        <div style={cssVars}>
          <div
            style={{ overflow: "hidden" }}
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
              }}
            >
              {/* ── Info panel ───────────────────────────────────────────── */}
              <div style={{ width: "50%", boxSizing: "border-box" }}>
                <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 120px" }}>

                  {/* RSVP / host controls */}
                  <PrivateActionArea
                    eventId={id}
                    eventTitle={title}
                    creatorId={creatorId}
                    cohostIds={cohostIds}
                    initialCounts={rsvpCounts}
                    initialAttendees={attendees}
                  />

                  {/* Activity preview */}
                  {recentActivity.length > 0 && (
                    <div style={{ paddingTop: 6, paddingBottom: 6 }}>
                      {recentActivity.map((item, i) => {
                        const label = rsvpActivityLabel(item.response);
                        return (
                          <div
                            key={i}
                            style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 10, paddingBottom: 10 }}
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

                  {/* Hosting card */}
                  {creator && (
                    <div
                      style={{
                        marginTop: 4, borderRadius: 16,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        padding: "12px 16px",
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
                          <ExpandableDescription text={description} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Details card */}
                  {(spotsLimited || eventPrice !== null || rsvpDeadline) && (
                    <div
                      style={{
                        marginTop: 10, borderRadius: 16,
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        padding: "12px 16px",
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 700, opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px", textAlign: "center" }}>
                        Details
                      </p>
                      <div style={{ display: "grid", gap: 12 }}>
                        {spotsLimited && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
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
              <div style={{ width: "50%", boxSizing: "border-box" }}>
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

      {/* ── Page indicator dots — fixed above bottom nav ─────────────────── */}
      <div
        style={{
          position: "fixed",
          bottom: 76,
          left: 0, right: 0,
          display: "flex", justifyContent: "center", alignItems: "center",
          gap: 6,
          zIndex: 100,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          aria-label="Info"
          onClick={() => setPage(0)}
          style={{
            width: page === 0 ? 22 : 7, height: 7,
            borderRadius: 4,
            background: page === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.30)",
            border: "none", padding: 0,
            cursor: "pointer",
            transition: "width 0.2s ease, background 0.2s ease",
            pointerEvents: "auto",
          }}
        />
        <button
          type="button"
          aria-label="Moments"
          onClick={() => setPage(1)}
          style={{
            width: page === 1 ? 22 : 7, height: 7,
            borderRadius: 4,
            background: page === 1 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.30)",
            border: "none", padding: 0,
            cursor: "pointer",
            transition: "width 0.2s ease, background 0.2s ease",
            pointerEvents: "auto",
          }}
        />
      </div>
    </main>
  );
}

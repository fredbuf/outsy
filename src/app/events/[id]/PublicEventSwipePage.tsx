/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { useTileTransition } from "../../components/TileTransitionProvider";
import { BackButton } from "./BackButton";
import { EventOwnerActions } from "./EventOwnerActions";
import { ActionBar } from "./ActionBar";
import { AttendeeList } from "./AttendeeList";
import { ShareButton, type EventPreview } from "./ShareButton";
import { ExpandableDescription } from "./ExpandableDescription";
import { MomentsClient } from "./moments/MomentsClient";
import type { MomentRow } from "./moments/page";
import { BellIcon } from "./CustomIcons";

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  creator: { display_name: string | null; avatar_url: string | null; username: string | null } | null;
  cohostIds: string[];
  dateLine: string;
  timeLine: string | null;
  mapHref: string;
  venueName: string | null;
  description: string | null;
  descriptionTitle: string | null;
  price: string | null;
  isAnnounced: boolean;
  rsvpCounts: { going: number; maybe: number; cant_go: number };
  attendees: Attendee[];
  related: RelatedEvent[];
  sourceUrl: string | null;
  organizers: { name: string; role: string; slug: string | null }[];
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  startAt: string;
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
    description, descriptionTitle,
    price, isAnnounced,
    rsvpCounts, attendees, related,
    sourceUrl,
    organizers,
    guestsCanPost, guestsCanReact,
    initialMoments,
    startAt,
    previewMode = false,
    onPreviewBack,
    onPublish,
    previewSubmitting = false,
    previewError = null,
  } = props;

  const [page, setPage] = useState(0); // 0 = about, 1 = moments

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

  const cssVars = {
    "--border":         "rgba(255,255,255,0.10)",
    "--border-strong":  "rgba(255,255,255,0.18)",
    "--btn-bg":         "rgba(18,25,36,0.55)",
    "--btn-bg-active":  "rgba(255,255,255,0.13)",
    "--surface-subtle": "rgba(255,255,255,0.04)",
    "--background":     "rgba(18,25,36,0.55)",
    "--foreground":     "#f5f7fa",
    "--accent":         "#5EA8FF",
    color: "#f5f7fa",
  } as React.CSSProperties;

  const iconBtnStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 34, height: 34, borderRadius: "50%",
    background: "rgba(18,25,36,0.20)",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#f5f7fa", cursor: "pointer", flexShrink: 0,
    padding: 0,
  };

  const avatarBorder = "2px solid rgba(18,25,36,0.85)";
  const hasAttendees = rsvpCounts.going > 0 || rsvpCounts.maybe > 0;

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
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            <EventOwnerActions compact eventId={id} creatorId={creatorId} source={source} />
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

      {/* ── SEGMENTED CONTROL ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 20px 8px" }}>
        <div style={{ position: "relative", display: "flex", gap: 6 }}>
          {/* Sliding white pill indicator */}
          <div aria-hidden="true" style={{
            position: "absolute",
            top: 0, left: 0,
            width: 101, height: 25,
            borderRadius: 20,
            background: "#ffffff",
            border: "1px solid rgba(255,255,255,0.12)",
            transform: `translateX(${page === 0 ? 0 : 107}px)`,
            transition: "transform 0.28s cubic-bezier(0.25,0.46,0.45,0.94)",
            pointerEvents: "none",
            zIndex: 0,
          }} />
          <button
            type="button"
            onClick={() => setPage(0)}
            style={{
              width: 101, height: 25, borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              fontWeight: page === 0 ? 700 : 600, fontSize: 12,
              cursor: "pointer",
              color: page === 0 ? "#1f3659" : "#ffffff",
              position: "relative", zIndex: 1,
              transition: "color 0.2s",
            }}
          >
            About
          </button>
          <button
            type="button"
            onClick={() => setPage(1)}
            style={{
              width: 101, height: 25, borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              fontWeight: page === 1 ? 700 : 600, fontSize: 12,
              cursor: "pointer",
              color: page === 1 ? "#1f3659" : "#ffffff",
              position: "relative", zIndex: 1,
              transition: "color 0.2s",
            }}
          >
            Moments
          </button>
        </div>
      </div>

      {/* ── CONTENT ───────────────────────────────────────────────────────── */}
      <div style={cssVars as React.CSSProperties}>

          {/* ── ABOUT PANEL ─────────────────────────────────────────────── */}
          <div style={{ display: page === 0 ? "block" : "none" }}>
          <div style={{ padding: "16px 20px 48px" }}>

              {/* RSVP / Tickets */}
              <ActionBar
                eventId={id}
                initialCounts={rsvpCounts}
                sourceUrl={sourceUrl}
                visibility="public"
                previewMode={previewMode}
              />

              {/* Attendees row */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 12, padding: "18px 0 16px",
              }}>
                {hasAttendees ? (
                  <AttendeeList
                    eventId={id}
                    initialAttendees={attendees}
                    goingCount={rsvpCounts.going}
                    maybeCount={rsvpCounts.maybe}
                    cantGoCount={rsvpCounts.cant_go}
                    visibility="public"
                    token={session?.access_token ?? null}
                    avatarSize={28}
                    creatorId={creatorId}
                    creator={creator}
                  />
                ) : (
                  <span style={{ fontSize: 12, opacity: 0.45 }}>No guests yet — be first!</span>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <ShareButton title={title} eventId={id} preview={sharePreview} />
                  <button type="button" style={iconBtnStyle} aria-label="Notifications">
                    <BellIcon size={18} />
                  </button>
                </div>
              </div>

              {/* Organized by card */}
              {(creator || organizers.length > 0) && (
                <div style={{
                  borderRadius: 20,
                  background: "rgba(18,25,36,0.14)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: "16px",
                }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#f5f7fa", textAlign: "center", margin: "0 0 12px" }}>
                    Organized by
                  </p>

                  {/* Creator avatar — manual/user-submitted events only */}
                  {creator && (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: (organizers.length > 0 || description) ? 14 : 0 }}>
                      {creatorId ? (
                        <Link href={`/profile/${creatorId}`} style={{ lineHeight: 0, display: "block", textDecoration: "none" }}>
                          {creator.avatar_url ? (
                            <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={28} height={28}
                              style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: avatarBorder, display: "block" }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none", border: avatarBorder }}>
                              {getInitials(creator.display_name)}
                            </div>
                          )}
                        </Link>
                      ) : creator.avatar_url ? (
                        <img src={creator.avatar_url} alt={creator.display_name ?? ""} width={28} height={28}
                          style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: avatarBorder, display: "block" }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(creator.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", userSelect: "none", border: avatarBorder }}>
                          {getInitials(creator.display_name)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Organizer entities — venue, promoter, artist, etc. */}
                  {organizers.length > 0 && (
                    <>
                      {creator && <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "0 0 12px" }} />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: description ? 14 : 0 }}>
                        {organizers.map((o) => (
                          <p key={o.name} style={{ margin: 0, fontSize: 13, textAlign: "center", color: "#f5f7fa" }}>
                            {o.slug ? (
                              <Link href={`/o/${o.slug}`} style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.25)", textUnderlineOffset: 3 }}>
                                {o.name}
                              </Link>
                            ) : o.name}
                            <span style={{ color: "rgba(255,255,255,0.40)", fontSize: 11 }}> · {o.role}</span>
                          </p>
                        ))}
                      </div>
                    </>
                  )}

                  {description && (
                    <>
                      <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "0 0 14px" }} />
                      {descriptionTitle && (
                        <p style={{ fontSize: 14, fontWeight: 600, textAlign: "center", margin: "0 0 6px", color: "#f5f7fa" }}>
                          {descriptionTitle}
                        </p>
                      )}
                      <div style={{ fontSize: 13, color: "#ffffff", textAlign: "center", lineHeight: 1.55 }}>
                        <ExpandableDescription text={description} />
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* More events like this */}
              {related.length > 0 && (
                <section style={{ paddingTop: 32 }}>
                  <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>More events like this</h2>
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
              )}

          </div>
          </div>

          {/* ── MOMENTS PANEL ─────────────────────────────────────────── */}
          <div style={{ display: page === 1 ? "block" : "none" }}>
            <MomentsClient
              embedded
              eventId={id}
              eventTitle={title}
              creatorId={creatorId}
              cohostIds={cohostIds}
              guestsCanPost={guestsCanPost}
              guestsCanReact={guestsCanReact}
              initialMoments={initialMoments}
              visibility="public"
            />
          </div>

      </div>

    </main>
  );
}

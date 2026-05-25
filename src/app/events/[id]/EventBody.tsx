/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/loadGoogleMaps";
import Link from "next/link";
import { useAuth } from "../../components/AuthProvider";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";
import { MomentsClient } from "./moments/MomentsClient";
import type { MomentRow } from "./moments/page";
import { GoingIcon, CantGoIcon, MaybeIcon, BellIcon } from "./CustomIcons";
import { ShareButton, type EventPreview } from "./ShareButton";

// ── Types ────────────────────────────────────────────────────────────────────

type RsvpResponse = "going" | "maybe" | "cant_go";
type Attendee = { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null };
type CohostProfile = { id: string; display_name: string | null; avatar_url: string | null; username: string | null };
type Organizer = { name: string; role: string; slug: string | null; image_url: string | null; custom_image_url: string | null };

export type EventBodyProps = {
  eventId: string;
  eventTitle: string;
  category: string;
  visibility: "public" | "private";
  isHostOrCohost: boolean;
  previewMode?: boolean;
  sharePreview?: EventPreview;
  // RSVP
  initialRsvpCounts: { going: number; maybe: number; cant_go: number };
  sourceUrl: string | null;
  // Guests
  attendees: Attendee[];
  creatorId: string | null;
  creator: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null; username: string | null } | null;
  cohostIds: string[];
  cohostProfiles?: CohostProfile[];
  spotsLimited: boolean;
  spotsLimit: number | null;
  // About
  description: string | null;
  descriptionTitle: string | null;
  // Hosted by
  organizers: Organizer[];
  // Where
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueLat: number | null;
  venueLng: number | null;
  mapHref: string | null;
  // Details
  eventPrice: number | null;
  eventCurrency: string;
  paymentMethod: string | null;
  paymentContact: string | null;
  rsvpDeadline: string | null;
  // Moments
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  eventOrganizerIds?: string[];
  // Optional slot rendered at the bottom of the About tab only
  relatedEventsNode?: React.ReactNode;
};

// ── Color tokens ─────────────────────────────────────────────────────────────

const C = {
  going:  "#22C55E",
  maybe:  "#FBBF24",
  cantgo: "#F87171",
  accent: "#5EA8FF",
  dim:    "rgba(255,255,255,0.40)",
  faint:  "rgba(255,255,255,0.25)",
  surface:"rgba(18,25,36,0.18)",
  border: "rgba(255,255,255,0.10)",
  pageBg: "#0b0f14",
};

// ── SectionLabel ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "1.2px", color: C.faint,
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// ── CalendarToast ────────────────────────────────────────────────────────────

function CalendarToast({ visible }: { visible: boolean }) {
  return (
    <div style={{
      position: "fixed",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)",
      left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : 12}px)`,
      opacity: visible ? 1 : 0,
      transition: "opacity 0.22s ease, transform 0.22s ease",
      pointerEvents: "none",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "11px 20px",
      borderRadius: 32,
      background: "rgba(11,15,20,0.95)",
      backdropFilter: "blur(16px) saturate(160%)",
      WebkitBackdropFilter: "blur(16px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.14)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.50)",
      whiteSpace: "nowrap",
    }}>
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.going} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <polyline points="9 16 11 18 15 14" />
      </svg>
      <span style={{ fontSize: 14, fontWeight: 600, color: "#f5f7fa" }}>Added to your calendar</span>
    </div>
  );
}

// ── RsvpSegmented ─────────────────────────────────────────────────────────────

function RsvpSegmented({
  myRsvp,
  onSelect,
  busy,
  onSignIn,
  isLoggedIn,
}: {
  myRsvp: RsvpResponse | null;
  onSelect: (r: RsvpResponse) => void;
  busy: boolean;
  onSignIn: () => void;
  isLoggedIn: boolean;
}) {
  const cells: { id: RsvpResponse; label: string; tone: string; Icon: () => React.ReactElement }[] = [
    { id: "going",   label: "Going",     tone: C.going,  Icon: () => <GoingIcon  size={28} /> },
    { id: "maybe",   label: "Maybe",     tone: C.maybe,  Icon: () => <MaybeIcon  size={28} /> },
    { id: "cant_go", label: "Can't go",  tone: C.cantgo, Icon: () => <CantGoIcon size={28} /> },
  ];

  return (
    <div>
      <div style={{
        display: "flex",
        alignItems: "stretch",
        height: 76,
        background: C.surface,
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        padding: 4,
        gap: 3,
        boxSizing: "border-box",
      }}>
        {cells.map(({ id, label, tone, Icon }) => {
          const active = myRsvp === id;
          return (
            <button
              key={id}
              type="button"
              disabled={busy}
              onClick={() => { if (!isLoggedIn) { onSignIn(); return; } onSelect(id); }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                padding: "8px 4px",
                borderRadius: 16,
                border: "none",
                background: active ? `rgba(${hexToRgb(tone)}, 0.16)` : "transparent",
                boxShadow: active ? `0 0 0 1.2px rgba(${hexToRgb(tone)}, 0.55) inset` : "none",
                cursor: busy ? "wait" : "pointer",
                transition: "background 0.15s, box-shadow 0.15s",
                color: active ? tone : "rgba(255,255,255,0.85)",
              }}
            >
              <div style={{ color: active ? tone : "rgba(255,255,255,0.70)" }}>
                <Icon />
              </div>
              <span style={{
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                color: active ? tone : "rgba(255,255,255,0.85)",
              }}>
                {label}
              </span>
            </button>
          );
        })}
      </div>

      {!isLoggedIn && (
        <p style={{ fontSize: 12, color: C.dim, textAlign: "center", margin: "8px 0 0" }}>
          <button
            type="button"
            onClick={onSignIn}
            style={{
              background: "none", border: "none", padding: 0,
              cursor: "pointer", fontSize: "inherit",
              color: C.accent, fontWeight: 600,
            }}
          >
            Sign in
          </button>
          {" "}to mark your attendance
        </p>
      )}
    </div>
  );
}

// hex → "r, g, b" for rgba() usage
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return "255,255,255";
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

// ── GuestsRow ─────────────────────────────────────────────────────────────────

function GuestsRow({
  eventId,
  attendees,
  goingCount,
  maybeCount,
  cantGoCount,
  spotsLimited,
  spotsLimit,
  visibility,
  creatorId,
  creator,
  cohostProfiles,
  isHostOrCohost,
  sharePreview,
  eventTitle,
  myRsvp,
}: {
  eventId: string;
  attendees: Attendee[];
  goingCount: number;
  maybeCount: number;
  cantGoCount: number;
  spotsLimited: boolean;
  spotsLimit: number | null;
  visibility: "public" | "private";
  creatorId: string | null;
  creator: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null } | null;
  cohostProfiles?: CohostProfile[];
  isHostOrCohost: boolean;
  sharePreview?: EventPreview;
  eventTitle: string;
  myRsvp: RsvpResponse | null;
}) {
  const { session } = useAuth();
  const isEmpty = goingCount === 0 && maybeCount === 0;
  const showNonEmpty = !isEmpty || myRsvp === "going" || myRsvp === "maybe";
  const totalGoing = goingCount;
  const spotsLeft = spotsLimited && spotsLimit !== null ? Math.max(0, spotsLimit - totalGoing) : null;
  const showViewGuestList = spotsLimited && spotsLimit !== null && totalGoing > spotsLimit / 2;

  const MAX_AVATARS = 3;
  const visibleAvatars = attendees.slice(0, MAX_AVATARS);
  const overflowCount = Math.max(0, totalGoing - MAX_AVATARS);

  // Build name line
  function guestNameParts(): { bold: string; dim: string } {
    if (myRsvp === "going") return { bold: "You are going", dim: "" };
    if (myRsvp === "maybe") return { bold: "Not sure yet? Stay in the loop.", dim: "" };
    if (isEmpty) return { bold: "", dim: "" };
    const names = attendees.slice(0, 2).map(a => a.display_name ?? "Someone");
    if (goingCount === 1) return { bold: names[0] ?? "Someone", dim: " going" };
    if (goingCount === 2) return { bold: `${names[0]} and ${names[1] ?? "another"}`, dim: " going" };
    const others = goingCount - 2;
    return {
      bold: `${names[0]}, ${names[1] ?? "others"}`,
      dim: ` and ${others} other${others !== 1 ? "s" : ""} going`,
    };
  }

  const ringStyle = "2px solid " + C.pageBg;

  function openGuestList() {
    window.dispatchEvent(new CustomEvent("outsy:open-guest-list"));
  }

  return (
    <div style={{
      background: C.surface,
      borderRadius: 18,
      border: `1px solid ${C.border}`,
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}>
      {/* Left: avatar stack */}
      <div
        style={{ display: "flex", flexShrink: 0, cursor: isEmpty ? "default" : "pointer" }}
        onClick={isEmpty ? undefined : openGuestList}
        role={isEmpty ? undefined : "button"}
        aria-label={isEmpty ? undefined : "View guest list"}
      >
        {isEmpty ? (
          // Dashed placeholder avatars
          [0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 30, height: 30, borderRadius: "50%",
                border: "1.5px dashed rgba(255,255,255,0.25)",
                marginLeft: i === 0 ? 0 : -10,
                background: "rgba(255,255,255,0.04)",
                zIndex: 3 - i,
                position: "relative",
              }}
            />
          ))
        ) : (
          visibleAvatars.map((a, i) => (
            <div
              key={i}
              style={{
                marginLeft: i === 0 ? 0 : -10,
                zIndex: visibleAvatars.length - i,
                position: "relative",
                flexShrink: 0,
              }}
            >
              <GeneratedAvatar
                name={a.display_name}
                imageUrl={a.custom_avatar_url ?? a.avatar_url ?? null}
                size={30}
                style={{ border: ringStyle }}
              />
            </div>
          ))
        )}
        {overflowCount > 0 && (
          <div style={{
            marginLeft: -10,
            width: 30, height: 30, borderRadius: "50%",
            background: "rgba(255,255,255,0.10)",
            border: ringStyle,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 700, color: "#f5f7fa",
            zIndex: 0, position: "relative", flexShrink: 0,
          }}>
            +{overflowCount}
          </div>
        )}
      </div>

      {/* Middle: name copy + action link */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!showNonEmpty ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#f5f7fa", lineHeight: 1.3 }}>
              {isHostOrCohost ? "No one going yet" : "Be the first to RSVP"}
            </div>
            {spotsLeft !== null && (
              <div style={{ fontSize: 12, marginTop: 2, color: C.dim, lineHeight: 1.3 }}>
                <span style={{ color: C.accent, fontWeight: 600 }}>{spotsLimit} spots</span>
                {" · "}
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event("outsy:open-invite"))}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "inherit", color: C.accent, fontWeight: 600 }}
                >
                  Invite friends to fill them
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={openGuestList}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "block", width: "100%" }}
            >
              {(() => { const { bold, dim } = guestNameParts(); return (
                <div style={{ fontSize: 13, color: "#f5f7fa", lineHeight: 1.35 }}>
                  <span style={{ fontWeight: 600 }}>{bold}</span>
                  {dim && <span style={{ color: C.dim, fontWeight: 400 }}>{dim}</span>}
                </div>
              ); })()}
            </button>
            <div style={{ fontSize: 12, marginTop: 2, color: C.dim, lineHeight: 1.3 }}>
              {spotsLeft !== null && (
                <span style={{ color: C.accent, fontWeight: 600 }}>{spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left · </span>
              )}
              {showViewGuestList ? (
                <button
                  type="button"
                  onClick={openGuestList}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: "inherit", color: C.accent, fontWeight: 600 }}
                >
                  View guest list
                </button>
              ) : (
                visibility === "private" && isHostOrCohost
                  ? null
                  : <span style={{ color: C.dim }}>Invite friends</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right: share + bell buttons */}
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <ShareButton title={eventTitle} eventId={eventId} preview={sharePreview} />
        {/* Bell */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "rgba(18,25,36,0.20)",
            border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#f5f7fa", cursor: "pointer", flexShrink: 0, padding: 0,
          }}
        >
          <BellIcon size={18} />
        </button>
      </div>

      {/* Hidden AttendeeList trigger — the GuestsRow dispatches outsy:open-guest-list */}
      {/* AttendeeList listens for this event in its own useEffect */}
    </div>
  );
}

// ── AboutSection ──────────────────────────────────────────────────────────────

function AboutSection({ text, title }: { text: string; title: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const CLAMP = 3;
  const isLong = text.split("\n").length > CLAMP || text.length > 220;

  return (
    <section>
      <SectionLabel>About</SectionLabel>
      {title && (
        <div style={{ fontSize: 15, fontWeight: 700, color: "#f5f7fa", marginBottom: 6 }}>
          {title}
        </div>
      )}
      <div>
        <p style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: "rgba(255,255,255,0.88)",
          margin: 0,
          whiteSpace: "pre-wrap",
          ...(isLong && !expanded
            ? {
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: CLAMP,
                WebkitBoxOrient: "vertical",
              }
            : {}),
        }}>
          {text}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            style={{
              marginTop: 6,
              background: "none", border: "none", padding: 0,
              cursor: "pointer", fontSize: 14, fontWeight: 600,
              color: C.accent,
            }}
          >
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </section>
  );
}

// ── HostedBySection ───────────────────────────────────────────────────────────

type Host = { name: string; avatarUrl: string | null; href: string | null; isSquare?: boolean };

function HostedBySection({ hosts }: { hosts: Host[] }) {
  if (hosts.length === 0) return null;

  const n = hosts.length;
  const avatarSize = n === 1 ? 40 : n === 2 ? 36 : 32;
  const overlap = 13;

  function hostNames(): string {
    if (n === 1) return hosts[0].name;
    if (n === 2) return `${hosts[0].name} & ${hosts[1].name}`;
    if (n === 3) return `${hosts[0].name}, ${hosts[1].name} & ${hosts[2].name}`;
    return `${hosts[0].name}, ${hosts[1].name} & ${n - 2} others`;
  }

  function hostMeta(): string {
    if (n === 1) return "Hosting";
    return `${n} cohosts`;
  }

  const ringStyle = "2px solid " + C.pageBg;

  return (
    <section>
      <SectionLabel>Hosted by</SectionLabel>
      <div style={{
        background: C.surface,
        borderRadius: 18,
        border: `1px solid ${C.border}`,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        cursor: "pointer",
      }}>
        {/* Avatar stack */}
        <div style={{ display: "flex", flexShrink: 0 }}>
          {hosts.slice(0, 3).map((h, i) => {
            const avatar = (
              <div
                key={i}
                style={{
                  marginLeft: i === 0 ? 0 : -overlap,
                  zIndex: 3 - i,
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <GeneratedAvatar
                  name={h.name}
                  imageUrl={h.avatarUrl}
                  size={avatarSize}
                  shape={h.isSquare ? "square" : undefined}
                  borderRadius={h.isSquare ? 8 : undefined}
                  style={{ border: ringStyle }}
                />
              </div>
            );
            return h.href ? (
              <Link key={i} href={h.href} style={{ textDecoration: "none", display: "contents" }}>
                {avatar}
              </Link>
            ) : avatar;
          })}
          {n > 3 && (
            <div style={{
              marginLeft: -overlap,
              width: avatarSize, height: avatarSize, borderRadius: "50%",
              background: "rgba(255,255,255,0.10)",
              border: ringStyle,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 700, color: "#f5f7fa",
              zIndex: 0, position: "relative",
            }}>
              +{n - 3}
            </div>
          )}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 600, color: "#f5f7fa",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {hostNames()}
          </div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {hostMeta()}
          </div>
        </div>

        {/* Chevron */}
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.dim} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </section>
  );
}

// ── WhereCard ─────────────────────────────────────────────────────────────────

// Same styles as /app/map/page.tsx — dark Outsy theme
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MINI_MAP_STYLES: any[] = [
  { featureType: "all",           elementType: "labels.text.fill",   stylers: [{ color: "#ffffff" }] },
  { featureType: "all",           elementType: "labels.text.stroke", stylers: [{ color: "#000000" }, { lightness: 13 }] },
  { featureType: "administrative",elementType: "geometry.fill",      stylers: [{ color: "#000000" }] },
  { featureType: "administrative",elementType: "geometry.stroke",    stylers: [{ color: "#5ea8ff" }, { lightness: 14 }, { weight: 1.4 }] },
  { featureType: "administrative",elementType: "labels",             stylers: [{ color: "#ffffff" }, { weight: "0.01" }] },
  { featureType: "landscape",     elementType: "all",                stylers: [{ color: "#08304b" }] },
  { featureType: "poi",           elementType: "geometry",           stylers: [{ color: "#435c7a" }, { lightness: 5 }] },
  { featureType: "poi",           elementType: "labels.icon",        stylers: [{ visibility: "off" }] },
  { featureType: "road.highway",  elementType: "geometry.fill",      stylers: [{ color: "#000000" }] },
  { featureType: "road.highway",  elementType: "geometry.stroke",    stylers: [{ color: "#2563e2" }, { lightness: 25 }] },
  { featureType: "road.arterial", elementType: "geometry.fill",      stylers: [{ color: "#0b0f14" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke",    stylers: [{ color: "#435c7a" }, { lightness: 16 }] },
  { featureType: "road.local",    elementType: "geometry",           stylers: [{ color: "#0b0f14" }] },
  { featureType: "transit",       elementType: "geometry",           stylers: [{ color: "#2563e2" }] },
  { featureType: "water",         elementType: "all",                stylers: [{ color: "#0b0f14" }] },
];

function WhereCard({
  venueName,
  venueAddress,
  venueCity,
  venueLat,
  venueLng,
  mapHref,
}: {
  venueName: string | null;
  venueAddress: string | null;
  venueCity: string | null;
  venueLat: number | null;
  venueLng: number | null;
  mapHref: string | null;
}) {
  const hasCoords = venueLat !== null && venueLng !== null;
  const mapDivRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const addressLine = [venueAddress, venueCity].filter(Boolean).join(", ") || venueName;

  useEffect(() => {
    if (!hasCoords || !mapDivRef.current || mapFailed) return;
    const lat = venueLat!;
    const lng = venueLng!;

    function initMiniMap() {
      if (!mapDivRef.current || mapInstanceRef.current) return;
      if (!window.google?.maps) return;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = new window.google.maps.Map(mapDivRef.current, {
          center: { lat, lng },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "none",
          clickableIcons: false,
          keyboardShortcuts: false,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          renderingType: (window.google.maps as any).RenderingType?.RASTER ?? "RASTER",
          styles: MINI_MAP_STYLES,
        });
        map.setOptions({ styles: MINI_MAP_STYLES });
        new window.google.maps.Marker({
          map,
          position: { lat, lng },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: "#2563EB",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });
        mapInstanceRef.current = map;
      } catch {
        setMapFailed(true);
      }
    }

    let cancelled = false;
    loadGoogleMaps()
      .then(() => { if (!cancelled) initMiniMap(); })
      .catch(() => { if (!cancelled) setMapFailed(true); });
    return () => {
      cancelled = true;
      mapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCoords, venueLat, venueLng]);

  return (
    <section>
      <SectionLabel>Where</SectionLabel>
      <div style={{
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${C.border}`,
        position: "relative",
      }}>
        {/* Map tile — 130px tall */}
        <div className="event-minimap" style={{ height: 130, overflow: "hidden", position: "relative" }}>
          <style>{`.event-minimap .gmnoprint,.event-minimap .gm-style-cc,.event-minimap a[href*="maps.google"]{display:none!important}`}</style>
          {hasCoords && !mapFailed ? (
            <div
              ref={mapDivRef}
              style={{ width: "100%", height: "100%", pointerEvents: "none" }}
            />
          ) : (
            <div style={{
              width: "100%", height: "100%",
              background: "linear-gradient(135deg, #0d1826 0%, #0b1420 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
          )}
          {/* Dark gradient overlay */}
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(to bottom, transparent 40%, rgba(11,15,20,0.55) 100%)",
            pointerEvents: "none",
          }} />
        </div>

        {/* Address floating card */}
        <div style={{
          padding: "11px 14px",
          background: "rgba(11,15,20,0.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}>
          <div style={{ minWidth: 0 }}>
            {venueName && (
              <div style={{
                fontSize: 14, fontWeight: 600, color: "#f5f7fa",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {venueName}
              </div>
            )}
            {addressLine && addressLine !== venueName && (
              <div style={{
                fontSize: 12, color: C.dim, marginTop: 2,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {addressLine}
              </div>
            )}
          </div>
          {mapHref && (
            <Link
              href={mapHref}
              style={{
                fontSize: 13, fontWeight: 600, color: C.accent,
                textDecoration: "none",
                flexShrink: 0,
                padding: "5px 10px",
                borderRadius: 20,
                background: "rgba(94,168,255,0.10)",
                border: "1px solid rgba(94,168,255,0.22)",
              }}
            >
              Open
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

// ── PaymentPill ───────────────────────────────────────────────────────────────

function PaymentPill({ method, contact }: { method: string | null; contact: string | null }) {
  const [revealed, setRevealed] = useState(false);
  if (!method) return null;

  const base: React.CSSProperties = {
    display: "inline-flex", alignItems: "center",
    fontSize: 12, fontWeight: 600,
    color: "#5EA8FF",
    background: "rgba(30,58,138,0.35)",
    border: "1px solid rgba(94,168,255,0.22)",
    borderRadius: 20, padding: "3px 9px",
    flexShrink: 0, whiteSpace: "nowrap",
  };

  if (method === "door" || method === "cash") return <span style={base}>Pay on site</span>;

  if (method === "interac" && contact) {
    return (
      <button type="button" onClick={() => setRevealed(v => !v)}
        style={{ ...base, cursor: "pointer", fontFamily: "inherit" }}>
        {revealed ? contact : "Via Interac"}
      </button>
    );
  }

  const label = method === "interac" ? "Via Interac"
              : method === "venmo" ? "Via Venmo"
              : methodLabel(method);
  return <span style={base}>{label}</span>;
}

// ── DetailsSection ────────────────────────────────────────────────────────────

function DetailsSection({
  spotsLimited,
  spotsLimit,
  goingCount,
  eventPrice,
  eventCurrency,
  paymentMethod,
  paymentContact,
  rsvpDeadline,
}: {
  spotsLimited: boolean;
  spotsLimit: number | null;
  goingCount: number;
  eventPrice: number | null;
  eventCurrency: string;
  paymentMethod: string | null;
  paymentContact: string | null;
  rsvpDeadline: string | null;
}) {
  const hasSpots = spotsLimited && spotsLimit !== null;
  const hasPrice = eventPrice !== null && eventPrice > 0;
  const hasDeadline = Boolean(rsvpDeadline);

  if (!hasSpots && !hasPrice && !hasDeadline) return null;

  // Days left calculation for RSVP deadline
  let daysLeft: number | null = null;
  let deadlineDateStr = "";
  let isPastDeadline = false;
  if (rsvpDeadline) {
    const [y, m, d] = rsvpDeadline.split("-").map(Number);
    const deadline = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    daysLeft = Math.ceil((deadline.getTime() - today.getTime()) / 86_400_000);
    isPastDeadline = daysLeft < 0;
    deadlineDateStr = deadline.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  const DIVIDER_INSET = 58; // px from left before divider starts

  const rows = [
    hasSpots && {
      icon: (
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      label: "Spots available",
      value: `${Math.max(0, spotsLimit! - goingCount)} of ${spotsLimit}`,
      rightSlot: null as React.ReactNode,
      muted: false,
    },
    hasPrice && {
      icon: (
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
      label: "Cost",
      value: formatPrice(eventPrice!, eventCurrency),
      rightSlot: paymentMethod
        ? <PaymentPill method={paymentMethod} contact={paymentContact} /> as React.ReactNode
        : null,
      muted: false,
    },
    hasDeadline && {
      icon: (
        <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      label: "RSVP by",
      value: isPastDeadline ? "RSVPs closed" : deadlineDateStr,
      rightSlot: (!isPastDeadline && daysLeft !== null) ? (
        <span style={{
          fontSize: 12, fontWeight: 600,
          color: C.accent,
          background: "rgba(94,168,255,0.10)",
          border: "1px solid rgba(94,168,255,0.20)",
          borderRadius: 20, padding: "3px 9px",
          flexShrink: 0, whiteSpace: "nowrap",
        }}>
          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left
        </span>
      ) : null as React.ReactNode,
      muted: isPastDeadline,
    },
  ].filter(Boolean) as Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
    rightSlot: React.ReactNode;
    muted?: boolean;
  }>;

  return (
    <section>
      <SectionLabel>Details</SectionLabel>
      <div style={{
        background: C.surface,
        borderRadius: 18,
        border: `1px solid ${C.border}`,
        overflow: "hidden",
      }}>
        {rows.map((row, i) => (
          <div key={i}>
            {i > 0 && (
              <div style={{
                height: 1,
                background: C.border,
                marginLeft: DIVIDER_INSET,
              }} />
            )}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 16px",
            }}>
              {/* Icon tile */}
              <div style={{
                width: 30, height: 30,
                borderRadius: 8,
                background: "rgba(255,255,255,0.07)",
                border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                color: row.muted ? C.dim : "rgba(255,255,255,0.65)",
              }}>
                {row.icon}
              </div>

              {/* Label + value */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.2, marginBottom: 2 }}>
                  {row.label}
                </div>
                {row.value && (
                  <div style={{
                    fontSize: 15, fontWeight: 600,
                    color: row.muted ? C.dim : "#f5f7fa",
                    lineHeight: 1.2,
                  }}>
                    {row.value}
                  </div>
                )}
              </div>

              {/* Right slot */}
              {row.rightSlot}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatPrice(price: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: currency || "CAD",
      minimumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${currency}$${price}`;
  }
}

function methodLabel(method: string): string {
  const map: Record<string, string> = {
    interac: "Interac",
    venmo: "Venmo",
    cash: "Cash",
    door: "at the door",
    other: "other",
  };
  return map[method] ?? method;
}

// ── EventBody (main export) ───────────────────────────────────────────────────

export function EventBody(props: EventBodyProps) {
  const {
    eventId, eventTitle, visibility, isHostOrCohost, previewMode = false,
    sharePreview,
    initialRsvpCounts,
    attendees, creatorId, creator, cohostIds, cohostProfiles,
    spotsLimited, spotsLimit,
    description, descriptionTitle,
    organizers,
    venueName, venueAddress, venueCity, venueLat, venueLng, mapHref,
    eventPrice, eventCurrency, paymentMethod, paymentContact, rsvpDeadline,
    guestsCanPost, guestsCanReact, initialMoments, eventOrganizerIds = [],
    relatedEventsNode,
  } = props;

  const { user, session } = useAuth();

  // ── State ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"about" | "moments">("about");
  const [renderedTab, setRenderedTab] = useState<"about" | "moments">("about");
  const [contentVisible, setContentVisible] = useState(true);
  const [rsvpCounts, setRsvpCounts] = useState(initialRsvpCounts);
  const [myRsvp, setMyRsvp] = useState<RsvpResponse | null>(null);
  const [loadingRsvp, setLoadingRsvp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const momentsCount = initialMoments.length;

  // ── RSVP fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (previewMode || !session?.access_token) return;
    setLoadingRsvp(true);
    fetch(`/api/events/${eventId}/rsvp`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(json => {
        if (json?.ok) {
          setMyRsvp((json.myResponse as RsvpResponse) ?? null);
          setRsvpCounts(json.counts);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRsvp(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, session?.access_token]);

  // ── RSVP action ───────────────────────────────────────────────
  async function handleRsvp(r: RsvpResponse) {
    if (!session?.access_token || submitting) return;
    const isToggleOff = myRsvp === r;
    const newState: RsvpResponse | null = isToggleOff ? null : r;
    const prevState = myRsvp;
    setMyRsvp(newState);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: isToggleOff ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        ...(isToggleOff ? {} : { body: JSON.stringify({ response: r }) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setMyRsvp(prevState);
        return;
      }
      setRsvpCounts(json.counts);
      if (newState === "going" || newState === "maybe") {
        setShowToast(true);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setShowToast(false), 2000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  // ── Tab switch ────────────────────────────────────────────────
  function handleTabChange(tab: "about" | "moments") {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    setContentVisible(false);
    fadeTimer.current = setTimeout(() => {
      setRenderedTab(tab);
      setContentVisible(true);
    }, 120);
  }

  // ── Hosts list ────────────────────────────────────────────────
  const hosts: Host[] = organizers.length > 0
    ? organizers.map(o => ({
        name: o.name,
        avatarUrl: o.custom_image_url ?? o.image_url,
        href: o.slug ? `/o/${o.slug}` : null,
        isSquare: true,
      }))
    : [
        ...(creator ? [{
          name: creator.display_name ?? "Host",
          avatarUrl: (creator as { custom_avatar_url?: string | null }).custom_avatar_url ?? creator.avatar_url,
          href: creatorId ? `/profile/${creatorId}` : null,
          isSquare: false,
        }] : []),
        ...(cohostProfiles ?? []).map(c => ({
          name: c.display_name ?? "Cohost",
          avatarUrl: c.avatar_url,
          href: `/profile/${c.id}`,
          isSquare: false,
        })),
      ];

  const busy = submitting || loadingRsvp || previewMode;

  const tabs = [
    { id: "about" as const, label: "About" },
    { id: "moments" as const, label: momentsCount > 0 ? `Moments  ${momentsCount}` : "Moments" },
  ];

  return (
    <div ref={bodyRef}>

      {/* ── STICKY TAB BAR ─────────────────────────────────────────────── */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "linear-gradient(180deg, rgba(11,15,20,0.92) 0%, rgba(11,15,20,0.98) 100%)",
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        borderBottom: "0.5px solid rgba(255,255,255,0.10)",
        overflowX: "auto",
        overflowY: "hidden",
        scrollbarWidth: "none",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any}>
        <div style={{
          display: "inline-flex",
          minWidth: "100%",
          justifyContent: "center",
          padding: "0 20px",
        }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                style={{
                  position: "relative",
                  padding: "14px 22px 12px",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#ffffff" : C.dim,
                  whiteSpace: "nowrap",
                  transition: "color 0.15s",
                  letterSpacing: isActive ? "-0.01em" : "normal",
                }}
              >
                {tab.label}
                {isActive && (
                  <div style={{
                    position: "absolute",
                    bottom: 0,
                    left: 22,
                    right: 22,
                    height: 2,
                    borderRadius: "2px 2px 0 0",
                    background: "#ffffff",
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── PANELS (fade) ─────────────────────────────────────────────── */}
      <div style={{ opacity: contentVisible ? 1 : 0, transition: "opacity 0.12s ease", minHeight: "50dvh" }}>

        {/* About */}
        <div style={{ display: renderedTab === "about" ? "block" : "none" }}>
          <div style={{ padding: "20px 20px 72px", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* RSVP Segmented selector */}
            {(!isHostOrCohost || previewMode) && (
              <RsvpSegmented
                myRsvp={myRsvp}
                onSelect={handleRsvp}
                busy={busy}
                onSignIn={openSignIn}
                isLoggedIn={Boolean(user)}
              />
            )}

            {/* Guests row */}
            <GuestsRow
              eventId={eventId}
              attendees={attendees}
              goingCount={rsvpCounts.going}
              maybeCount={rsvpCounts.maybe}
              cantGoCount={rsvpCounts.cant_go}
              spotsLimited={spotsLimited}
              spotsLimit={spotsLimit}
              visibility={visibility}
              creatorId={creatorId}
              creator={creator}
              cohostProfiles={cohostProfiles}
              isHostOrCohost={isHostOrCohost}
              sharePreview={sharePreview}
              eventTitle={eventTitle}
              myRsvp={myRsvp}
            />

            {/* About */}
            {description && (
              <AboutSection text={description} title={descriptionTitle} />
            )}

            {/* Hosted by */}
            {hosts.length > 0 && (
              <HostedBySection hosts={hosts} />
            )}

            {/* Where */}
            {venueName && (
              <WhereCard
                venueName={venueName}
                venueAddress={venueAddress}
                venueCity={venueCity}
                venueLat={venueLat}
                venueLng={venueLng}
                mapHref={mapHref}
              />
            )}

            {/* Details */}
            <DetailsSection
              spotsLimited={spotsLimited}
              spotsLimit={spotsLimit}
              goingCount={rsvpCounts.going}
              eventPrice={eventPrice}
              eventCurrency={eventCurrency}
              paymentMethod={paymentMethod}
              paymentContact={paymentContact}
              rsvpDeadline={rsvpDeadline}
            />

          </div>

          {/* More events like this — only visible on the About tab */}
          {relatedEventsNode}

        </div>

        {/* Moments */}
        <div style={{ display: renderedTab === "moments" ? "block" : "none" }}>
          <MomentsClient
            embedded
            eventId={eventId}
            eventTitle={eventTitle}
            creatorId={creatorId}
            cohostIds={cohostIds}
            eventOrganizerIds={eventOrganizerIds}
            guestsCanPost={guestsCanPost}
            guestsCanReact={guestsCanReact}
            initialMoments={initialMoments}
            visibility={visibility}
          />
        </div>

      </div>

      {/* ── CALENDAR TOAST ────────────────────────────────────────────── */}
      <CalendarToast visible={showToast} />

    </div>
  );
}

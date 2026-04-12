"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

function ExploreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10"/>
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" strokeWidth="0" fill={active ? "currentColor" : "rgba(255,255,255,0.35)"}/>
    </svg>
  );
}

function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      {active && <line x1="8" y1="15" x2="16" y2="15" strokeOpacity="0.6"/>}
    </svg>
  );
}

function InboxIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

// ── Spring easing ─────────────────────────────────────────────────────────────
// cubic-bezier(0.34, 1.56, 0.64, 1) — slight overshoot for native-mobile feel

const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// ── NavTab ────────────────────────────────────────────────────────────────────

function NavTab({
  href,
  active,
  label,
  badge = false,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  badge?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        padding: "7px 14px 6px",
        borderRadius: 999,
        textDecoration: "none",
        color: active ? "#5EA8FF" : "#8C98A8",
        background: active ? "rgba(94,168,255,0.10)" : "transparent",
        boxShadow: active ? "0 0 0 1px rgba(94,168,255,0.18) inset" : "none",
        transition: `color 0.22s ${SPRING}, background 0.22s ${SPRING}, box-shadow 0.22s ${SPRING}`,
        position: "relative",
        minWidth: 54,
        cursor: "pointer",
      }}
    >
      {/* Icon wrapper with spring scale */}
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: active ? "scale(1.12) translateY(-1px)" : "scale(1) translateY(0)",
          transition: `transform 0.28s ${SPRING}`,
        }}
      >
        {children}
      </span>
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "0.01em",
        opacity: active ? 1 : 0.7,
        transform: active ? "translateY(0)" : "translateY(0.5px)",
        transition: `opacity 0.22s ${SPRING}, transform 0.22s ${SPRING}`,
      }}>
        {label}
      </span>
      {badge && (
        <span
          aria-label="unread notifications"
          style={{
            position: "absolute",
            top: 4,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: "50%",
            background: "#ef4444",
            border: "2px solid #101722",
            boxShadow: "0 0 6px rgba(239,68,68,0.55)",
          }}
        />
      )}
    </Link>
  );
}

// ── Create button — standout center action ────────────────────────────────────

function CreateTab({ active }: { active: boolean }) {
  return (
    <Link
      href="/events/new"
      aria-label="Create event"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 48,
        height: 48,
        borderRadius: "50%",
        background: active ? "#2563EB" : "#3B82F6",
        boxShadow: active
          ? "0 2px 16px rgba(59,130,246,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset"
          : "0 2px 12px rgba(59,130,246,0.30), 0 0 0 1px rgba(255,255,255,0.08) inset",
        textDecoration: "none",
        color: "#fff",
        flexShrink: 0,
        marginInline: 4,
        transition: `background 0.22s ${SPRING}, box-shadow 0.22s ${SPRING}, transform 0.22s ${SPRING}`,
        transform: active ? "scale(0.93)" : "scale(1)",
        cursor: "pointer",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
    </Link>
  );
}

// ── BottomNav ─────────────────────────────────────────────────────────────────

export function BottomNav() {
  const pathname = usePathname();
  const { session } = useAuth();
  const [unread, setUnread] = useState(false);

  // Poll unread counts for the Inbox badge.
  // Re-runs on session change AND on pathname change so that navigating away
  // from a conversation (which marks messages read server-side) immediately
  // clears the dot without waiting for a window focus event.
  useEffect(() => {
    if (!session) { setUnread(false); return; }
    const token = session.access_token;
    function check() {
      fetch("/api/social/unread-counts", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d: { ok: boolean; activity?: number; messages?: number }) => {
          if (d.ok) setUnread((d.activity ?? 0) > 0 || (d.messages ?? 0) > 0);
        })
        .catch(() => {});
    }
    check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  // pathname is intentionally included: navigating away from a thread should
  // trigger a fresh count so the dot clears immediately.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, pathname]);

  // Hide on pages where the bottom nav conflicts with immersive/full-screen UI.
  // "/events/" (trailing slash) covers /events/new, /events/[id], /events/[id]/edit,
  // /events/[id]/moments — but NOT "/events" (the list page, no trailing slash).
  if (
    pathname === "/" ||
    pathname?.startsWith("/events/") ||
    pathname?.startsWith("/social/messages/") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/auth")
  ) {
    return null;
  }

  // Active state — exact match for root destinations, prefix match for sub-paths
  const activeHome     = pathname === "/" || pathname === "/events";
  const activeExplore  = pathname === "/map" || pathname?.startsWith("/map");
  const activeCreate   = pathname === "/events/new";
  const activeSchedule = pathname === "/schedule" || pathname?.startsWith("/schedule");
  const activeInbox    = pathname === "/social" || (pathname?.startsWith("/social") && !pathname.startsWith("/social/messages/"));

  return (
    <nav
      className="bottom-nav"
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: "max(16px, env(safe-area-inset-bottom, 16px))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        // Glass pill — neutral dark, no glow
        background: "rgba(16, 23, 34, 0.82)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 999,
        padding: "5px 6px",
        // Subtle shadow + inner top-highlight
        boxShadow: "0 8px 32px rgba(0,0,0,0.50), 0 1px 0 rgba(255,255,255,0.06) inset",
        gap: 2,
        pointerEvents: "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <NavTab href="/events" active={activeHome} label="Home">
        <HomeIcon active={activeHome} />
      </NavTab>

      <NavTab href="/map" active={activeExplore} label="Explore">
        <ExploreIcon active={activeExplore} />
      </NavTab>

      <CreateTab active={activeCreate} />

      <NavTab href="/schedule" active={activeSchedule} label="Schedule">
        <ScheduleIcon active={activeSchedule} />
      </NavTab>

      <NavTab href="/social" active={activeInbox} label="Inbox" badge={unread && !activeInbox}>
        <InboxIcon active={activeInbox} />
      </NavTab>
    </nav>
  );
}

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
        color: active ? "#c4b5fd" : "rgba(255,255,255,0.42)",
        background: active ? "rgba(124,58,237,0.18)" : "transparent",
        transition: "color 0.15s, background 0.15s",
        position: "relative",
        minWidth: 54,
        cursor: "pointer",
      }}
    >
      {children}
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "0.01em",
      }}>
        {label}
      </span>
      {badge && (
        <span
          aria-label="unread notifications"
          style={{
            position: "absolute",
            top: 6,
            right: 12,
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#a78bfa",
            border: "2px solid #0c0912",
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
        background: active ? "#6d28d9" : "#7c3aed",
        boxShadow: "0 2px 16px rgba(124,58,237,0.55)",
        textDecoration: "none",
        color: "#fff",
        flexShrink: 0,
        marginInline: 4,
        transition: "background 0.15s, box-shadow 0.15s",
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

  // Poll unread counts for the Inbox badge
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);

  // Hide on pages where the bottom nav conflicts with immersive/full-screen UI
  if (
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
        background: "rgba(12,9,18,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 999,
        padding: "5px 6px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(124,58,237,0.08) inset",
        gap: 2,
        pointerEvents: "auto",
        // Prevent text selection on rapid taps
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "./AuthProvider";

// ── Icons ─────────────────────────────────────────────────────────────────────

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 1.75 : 1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.07874 16.1354H14.8937"/>
      <path fillRule="evenodd" clipRule="evenodd" d="M2 14.713C2 9.082 2.614 9.475 5.919 6.41C7.365 5.246 9.61498 3 11.558 3C13.5 3 15.795 5.235 17.254 6.41C20.559 9.475 21.172 9.082 21.172 14.713C21.172 23 19.213 23 11.586 23C3.95901 23 2 23 2 14.713Z"/>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M15.7935 1C16.2075 1 16.5435 1.336 16.5435 1.75L16.544 2.59781C18.0041 2.69792 19.2167 3.19805 20.075 4.0581C21.012 4.9991 21.505 6.3521 21.5 7.9751V17.0981C21.5 20.4301 19.384 22.5001 15.979 22.5001H7.521C4.116 22.5001 2 20.4011 2 17.0221V7.9731C2 4.83029 3.88706 2.81294 6.96469 2.59815L6.9653 1.75C6.9653 1.336 7.3013 1 7.7153 1C8.1293 1 8.4653 1.336 8.4653 1.75L8.465 2.579H15.043L15.0435 1.75C15.0435 1.336 15.3795 1 15.7935 1ZM20 9.904H3.5V17.0221C3.5 19.5881 4.928 21.0001 7.521 21.0001H15.979C18.572 21.0001 20 19.6141 20 17.0981L20 9.904ZM16.2012 16.1963C16.6152 16.1963 16.9512 16.5323 16.9512 16.9463C16.9512 17.3603 16.6152 17.6963 16.2012 17.6963C15.7872 17.6963 15.4472 17.3603 15.4472 16.9463C15.4472 16.5323 15.7782 16.1963 16.1922 16.1963H16.2012ZM11.7637 16.1963C12.1777 16.1963 12.5137 16.5323 12.5137 16.9463C12.5137 17.3603 12.1777 17.6963 11.7637 17.6963C11.3497 17.6963 11.0097 17.3603 11.0097 16.9463C11.0097 16.5323 11.3407 16.1963 11.7547 16.1963H11.7637ZM7.3169 16.1963C7.7309 16.1963 8.0669 16.5323 8.0669 16.9463C8.0669 17.3603 7.7309 17.6963 7.3169 17.6963C6.9029 17.6963 6.5619 17.3603 6.5619 16.9463C6.5619 16.5323 6.8939 16.1963 7.3079 16.1963H7.3169ZM16.2012 12.3096C16.6152 12.3096 16.9512 12.6456 16.9512 13.0596C16.9512 13.4736 16.6152 13.8096 16.2012 13.8096C15.7872 13.8096 15.4472 13.4736 15.4472 13.0596C15.4472 12.6456 15.7782 12.3096 16.1922 12.3096H16.2012ZM11.7637 12.3096C12.1777 12.3096 12.5137 12.6456 12.5137 13.0596C12.5137 13.4736 12.1777 13.8096 11.7637 13.8096C11.3497 13.8096 11.0097 13.4736 11.0097 13.0596C11.0097 12.6456 11.3407 12.3096 11.7547 12.3096H11.7637ZM7.3169 12.3096C7.7309 12.3096 8.0669 12.6456 8.0669 13.0596C8.0669 13.4736 7.3109 13.8096 7.3169 13.8096C6.9029 13.8096 6.5619 13.4736 6.5619 13.0596C6.5619 12.6456 6.8939 12.3096 7.3079 12.3096H7.3169ZM15.043 4.079H8.465L8.4653 5.041C8.4653 5.455 8.1293 5.791 7.7153 5.791C7.3013 5.791 6.9653 5.455 6.9653 5.041L6.96477 4.1017C4.72454 4.28989 3.5 5.64786 3.5 7.9731V8.404H20L20 7.9731C20.004 6.7381 19.672 5.7781 19.013 5.1181C18.4345 4.53791 17.5889 4.1914 16.5444 4.10218L16.5435 5.041C16.5435 5.455 16.2075 5.791 15.7935 5.791C15.3795 5.791 15.0435 5.455 15.0435 5.041L15.043 4.079Z"/>
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
const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";

// ── NavTab ────────────────────────────────────────────────────────────────────
// Uses forwardRef so BottomNav can measure each tab's DOM position for the
// sliding indicator without polling or querySelectorAll.

interface NavTabProps {
  href: string;
  active: boolean;
  label: string;
  badge?: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}

const NavTab = React.forwardRef<HTMLAnchorElement, NavTabProps>(
  function NavTab({ href, active, label, badge = false, onSelect, children }, ref) {
    return (
      <Link
        ref={ref}
        href={href}
        onClick={onSelect}
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
          // Active/inactive colour only — background is handled by the sliding
          // indicator so individual tabs have no background of their own.
          color: active ? "#5EA8FF" : "#8C98A8",
          transition: `color 0.22s ${SPRING}`,
          position: "relative",
          zIndex: 1,         // sit above the indicator (z:0)
          minWidth: 54,
          cursor: "pointer",
        }}
      >
        {/* Icon with spring scale */}
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
);

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
        background: "#3b82f6b5",
        boxShadow: active
          ? "0 2px 16px rgba(59,130,246,0.45), 0 0 0 1px rgba(255,255,255,0.12) inset"
          : "0 2px 12px rgba(59,130,246,0.30), 0 0 0 1px rgba(255,255,255,0.08) inset",
        textDecoration: "none",
        color: "#fff",
        flexShrink: 0,
        marginInline: 4,
        transition: `box-shadow 0.22s ${SPRING}, transform 0.22s ${SPRING}`,
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

  // ── Optimistic path ───────────────────────────────────────────────────────
  // Set immediately when a tab is tapped so active states update before the
  // Next.js route transition completes. Cleared once pathname catches up.
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // ── Sliding indicator ──────────────────────────────────────────────────────
  const navRef  = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([null, null, null, null]);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
    animated: boolean;
  } | null>(null);
  // Suppress CSS transition on the very first measurement so the indicator
  // appears at the right position instantly (no slide-in from the left edge).
  const firstMeasure = useRef(true);

  // ── Active-state derivation ────────────────────────────────────────────────
  // Computed BEFORE the early-return guards so they are available to effects
  // and so the indicator can respond to pendingPath immediately.
  const eff           = pendingPath ?? pathname;
  const activeHome     = eff === "/" || eff === "/events";
  const activeExplore  = eff === "/map"      || (eff?.startsWith("/map")      ?? false);
  const activeSchedule = eff === "/schedule" || (eff?.startsWith("/schedule") ?? false);
  const activeInbox    = (eff === "/social"  || (eff?.startsWith("/social")   ?? false))
                           && !(eff?.startsWith("/social/messages/") ?? false);
  const activeCreate   = eff === "/events/new";
  // Index among the four NavTab slots (0=Home 1=Explore 2=Schedule 3=Inbox)
  const activeIndex    = [activeHome, activeExplore, activeSchedule, activeInbox].findIndex(Boolean);

  // ── Unread badge ───────────────────────────────────────────────────────────
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
  // pathname intentionally in deps so navigating away from a conversation
  // immediately clears the badge without waiting for window focus.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, pathname]);

  // ── Sync pending path ──────────────────────────────────────────────────────
  useEffect(() => {
    if (pendingPath !== null && pathname === pendingPath) {
      setPendingPath(null);
    }
  }, [pathname, pendingPath]);

  // ── Measure indicator position ─────────────────────────────────────────────
  // useLayoutEffect runs synchronously after DOM mutations and before the
  // browser paints, so the indicator is positioned correctly on the first
  // visible frame — no flash at (0,0) or delayed pop-in.
  useLayoutEffect(() => {
    if (activeIndex === -1 || !navRef.current) {
      setIndicator(null);
      return;
    }
    const tab = tabRefs.current[activeIndex];
    if (!tab) return;
    const navRect = navRef.current.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const animated = !firstMeasure.current;
    firstMeasure.current = false;
    setIndicator({
      left:     tabRect.left - navRect.left,
      width:    tabRect.width,
      animated,
    });
  }, [activeIndex]);

  // ── Route guard — hide nav on immersive pages ──────────────────────────────
  if (
    pathname === "/" ||
    pathname?.startsWith("/events/") ||
    pathname?.startsWith("/social/messages/") ||
    pathname?.startsWith("/admin") ||
    pathname?.startsWith("/auth")
  ) {
    return null;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <nav
      ref={navRef as React.RefObject<HTMLElement>}
      className="bottom-nav"
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: "max(16px, env(safe-area-inset-bottom, 16px))",
        left: "50%",
        // base transform; data-hidden overrides via globals.css
        transform: "translateX(-50%)",
        transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1), opacity 0.22s ease",
        zIndex: 150,
        display: "flex",
        alignItems: "center",
        // Glass pill
        background: "rgb(16 23 34 / 50%)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 999,
        padding: "5px 6px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.50), 0 1px 0 rgba(255,255,255,0.06) inset",
        gap: 2,
        pointerEvents: "auto",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Sliding liquid-glass indicator ──────────────────────────────────
          Absolutely positioned so it sits behind the tab content (z:0).
          Its left/width are updated on every tab change; the CSS transition
          makes it glide smoothly between positions.
          On initial render animated=false suppresses the transition so it
          appears directly at the correct position.                         */}
      {indicator && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 5,
            height: "calc(100% - 10px)",
            left: indicator.left,
            width: indicator.width,
            borderRadius: 999,
            background: "rgba(94,168,255,0.11)",
            boxShadow: "0 0 0 1px rgba(94,168,255,0.20) inset, 0 2px 10px rgba(94,168,255,0.08)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            transition: indicator.animated
              ? `left 0.28s ${SPRING}, width 0.28s ${SPRING}`
              : "none",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}

      <NavTab
        ref={(el) => { tabRefs.current[0] = el; }}
        href="/events"
        active={activeHome}
        label="Home"
        onSelect={() => setPendingPath("/events")}
      >
        <HomeIcon active={activeHome} />
      </NavTab>

      <NavTab
        ref={(el) => { tabRefs.current[1] = el; }}
        href="/map"
        active={activeExplore}
        label="Explore"
        onSelect={() => setPendingPath("/map")}
      >
        <ExploreIcon active={activeExplore} />
      </NavTab>

      <CreateTab active={activeCreate} />

      <NavTab
        ref={(el) => { tabRefs.current[2] = el; }}
        href="/schedule"
        active={activeSchedule}
        label="Schedule"
        onSelect={() => setPendingPath("/schedule")}
      >
        <ScheduleIcon active={activeSchedule} />
      </NavTab>

      <NavTab
        ref={(el) => { tabRefs.current[3] = el; }}
        href="/social"
        active={activeInbox}
        label="Inbox"
        badge={unread && !activeInbox}
        onSelect={() => setPendingPath("/social")}
      >
        <InboxIcon active={activeInbox} />
      </NavTab>
    </nav>
  );
}

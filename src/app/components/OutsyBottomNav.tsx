"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Ticket, CalendarDays, MessageSquare, CircleUser } from "lucide-react";
import { OutsyNav, type OutsyNavItem, type OutsyNavKey } from "@/components/outsy-nav";
import { useAuth } from "./AuthProvider";
import { useActiveOrganizer } from "./ActiveOrganizerContext";

// Adapter between the presentational OutsyNav dock and the app: maps the
// current pathname to a controlled `active` key, turns tab taps into route
// pushes, and carries over the route guard, unread polling, and organizer
// mode from the previous BottomNav.

type OrgNavKey = "events" | "calendar" | "inbox" | "profile";

const ORG_ITEMS: OutsyNavItem<OrgNavKey>[] = [
  { key: "events", label: "Events", Icon: Ticket },
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
  { key: "inbox", label: "Inbox", Icon: MessageSquare },
  { key: "profile", label: "Profile", Icon: CircleUser },
];

const USER_ROUTES: Record<OutsyNavKey, string> = {
  home: "/events",
  map: "/map",
  schedule: "/schedule",
  inbox: "/social",
};

export function OutsyBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();
  const [unread, setUnread] = useState(0);

  // Optimistic path — set on tap so the active pill moves before the Next.js
  // route transition completes; cleared once pathname catches up.
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  useEffect(() => {
    if (pendingPath !== null && pathname === pendingPath) setPendingPath(null);
  }, [pathname, pendingPath]);
  const eff = pendingPath ?? pathname;

  // ── Unread badge ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) { setUnread(0); return; }
    const token = session.access_token;
    function check() {
      fetch("/api/social/unread-counts", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d: { ok: boolean; activity?: number; messages?: number }) => {
          if (d.ok) setUnread((d.activity ?? 0) + (d.messages ?? 0));
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

  // ── Active-key derivation (same matching rules as the previous BottomNav) ──
  const userActive: OutsyNavKey | null =
    eff === "/" || eff === "/events" ? "home"
    : eff?.startsWith("/map") ? "map"
    : eff?.startsWith("/schedule") ? "schedule"
    : eff?.startsWith("/social") && !eff.startsWith("/social/messages/") ? "inbox"
    : null;

  const orgProfileHref = activeOrganizer?.slug ? `/o/${activeOrganizer.slug}` : "/org";
  const orgActive: OrgNavKey | null =
    eff?.startsWith("/org/events") ? "events"
    : eff?.startsWith("/org/calendar") ? "calendar"
    : eff?.startsWith("/org/inbox") ? "inbox"
    : (eff?.startsWith("/org/settings") || eff === orgProfileHref) ? "profile"
    : null;

  const orgRoutes: Record<OrgNavKey, string> = {
    events: "/org/events",
    calendar: "/org/calendar",
    inbox: "/org/inbox",
    profile: orgProfileHref,
  };

  const navigate = (href: string) => {
    setPendingPath(href);
    router.push(href);
  };

  // Tabs are buttons (not Links), so prefetch the destinations up-front to
  // keep transitions as snappy as the old Link-based nav.
  const routesKey = activeOrganizer ? Object.values(orgRoutes).join() : Object.values(USER_ROUTES).join();
  useEffect(() => {
    for (const href of routesKey.split(",")) router.prefetch(href);
    router.prefetch("/events/new");
  }, [routesKey, router]);

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

  const onCreate = () => navigate("/events/new");

  // Focus the home page's existing search bar; fall back to navigating home.
  const onSearch = () => {
    const el = document.querySelector<HTMLInputElement>("input.search-input");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus({ preventScroll: true });
    } else {
      navigate("/events");
    }
  };

  if (activeOrganizer) {
    return (
      <OutsyNav<OrgNavKey>
        items={ORG_ITEMS}
        active={orgActive}
        onChange={(key) => navigate(orgRoutes[key])}
        onCreate={onCreate}
        badges={{ inbox: unread }}
      />
    );
  }

  return (
    <OutsyNav
      active={userActive}
      onChange={(key) => navigate(USER_ROUTES[key])}
      onCreate={onCreate}
      onSearch={userActive === "home" ? onSearch : undefined}
      badges={{ inbox: unread }}
    />
  );
}

"use client";

import {
  useState,
  useEffect,
  useRef,
  type RefObject,
  type ComponentType,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  House,
  Compass,
  Plus,
  CalendarDays,
  MessageSquare,
  Search,
} from "lucide-react";

/**
 * OutsyNav — production floating navigation, ported faithfully from the
 * "Option 9 — Glass Pill · Morphs to Active" exploration (menu-option-9.tsx)
 * and decoupled from its comparison harness (ScrollContent/SearchChip).
 *
 * Understated frosted-glass pill with icon-only tabs and a sliding active
 * indicator (`layoutId`) — no label morph, tabs stay icon-only even when
 * active. Create is the blue FAB in the middle. On scroll-down the pill
 * contracts around the active icon (shown bare, no highlight layer) and
 * glides to the bottom-left as one continuous surface; scroll-up, or a tap
 * on the collapsed pill, glides it back and re-expands.
 *
 * Fully controlled: you own `active` and pass `onChange`. `active` may be
 * null when no tab matches the current route. Wire `onCreate` and
 * `onSearch` to your handlers; the search chip only renders when `onSearch`
 * is provided (pass it only on the route where search makes sense). Point
 * `scrollContainerRef` at whichever element actually scrolls; omit it to
 * use window scroll.
 *
 * Pass `items` to swap the tab set (e.g. organizer mode); defaults to the
 * user-mode tabs. The root carries the `bottom-nav` class so the existing
 * BottomNavContext hide/show contract and body clearance keep working.
 *
 * Requires: `motion` and `lucide-react`.
 */

export type OutsyNavKey = "home" | "map" | "schedule" | "inbox";

export interface OutsyNavItem<K extends string = OutsyNavKey> {
  key: K;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}

export interface OutsyNavProps<K extends string = OutsyNavKey> {
  active: K | null;
  onChange: (key: K) => void;
  onCreate: () => void;
  onSearch?: () => void;
  /** Ref to the scrolling element. Defaults to window scroll if omitted. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Unread badges keyed by section, e.g. { inbox: 3 }. */
  badges?: Partial<Record<K, number>>;
  /** Tab set. Exactly 4 items — Create renders between items 2 and 3. */
  items?: OutsyNavItem<K>[];
}

const USER_ITEMS: OutsyNavItem[] = [
  { key: "home", label: "Home", Icon: House },
  { key: "map", label: "Map", Icon: Compass },
  { key: "schedule", label: "Schedule", Icon: CalendarDays },
  { key: "inbox", label: "Inbox", Icon: MessageSquare },
];

const ACCENT = "var(--accent-blue, #5EA8FF)";
const ACCENT_DEEP = "var(--accent-blue-deep, #2563E2)";
const BADGE = "var(--badge-red, #FF4D4F)";

// Option 9's understated glass — a light frosted overlay, distinct from the
// darker glass used elsewhere in the app.
const GLASS = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
} as const;

/** Collapses on scroll-down past a threshold, expands on scroll-up. */
function useCollapseOnScroll(scrollContainerRef?: RefObject<HTMLElement | null>) {
  const [collapsed, setCollapsed] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const target: HTMLElement | Window = scrollContainerRef?.current ?? window;
    const readY = () =>
      target instanceof Window ? window.scrollY : target.scrollTop;

    const onScroll = () => {
      const y = readY();
      if (y > lastY.current + 4 && y > 50) setCollapsed(true);
      else if (y < lastY.current - 4) setCollapsed(false);
      lastY.current = y;
    };

    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollContainerRef]);

  return { collapsed, expand: () => setCollapsed(false) };
}

export function OutsyNav<K extends string = OutsyNavKey>({
  active,
  onChange,
  onCreate,
  onSearch,
  scrollContainerRef,
  badges,
  items = USER_ITEMS as unknown as OutsyNavItem<K>[],
}: OutsyNavProps<K>) {
  const { collapsed, expand } = useCollapseOnScroll(scrollContainerRef);
  const ActiveIcon =
    (active ? items.find((i) => i.key === active)?.Icon : undefined) ??
    items[0].Icon;

  return (
    <div className="bottom-nav outsy-nav fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      {/* Contextual search chip — only while expanded and onSearch provided */}
      <AnimatePresence>
        {onSearch && !collapsed && (
          <motion.button
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onClick={onSearch}
            className="pointer-events-auto absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3.5 h-9 rounded-full text-white/80 border border-white/10 shadow-lg"
            style={GLASS}
          >
            <Search className="size-4" strokeWidth={1.75} />
            <span style={{ fontSize: 12.5 }}>Search events</span>
          </motion.button>
        )}
      </AnimatePresence>

      <div
        className={`flex pb-[max(20px,env(safe-area-inset-bottom,20px))] ${
          collapsed ? "justify-start pl-5" : "justify-center"
        }`}
      >
        {/* Wrapper switches alignment; the pill's `layout` prop animates the
            glide between centered and bottom-left. */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={() => collapsed && expand()}
          className="pointer-events-auto flex items-center gap-1 px-2 py-2 rounded-full border border-white/10 shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
          style={GLASS}
        >
          {/* Left tabs */}
          <AnimatePresence mode="popLayout" initial={false}>
            {!collapsed &&
              items.slice(0, 2).map((it) => (
                <motion.div
                  key={it.key}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                >
                  <Tab
                    it={it}
                    active={active === it.key}
                    badge={badges?.[it.key]}
                    onClick={() => onChange(it.key)}
                  />
                </motion.div>
              ))}
          </AnimatePresence>

          {/* The morph anchor: this slot always holds something.
              Expanded → Create FAB. Collapsed → the bare active-section icon
              (no highlight layer), tapping it (or anywhere on the collapsed
              pill) re-expands via the outer onClick. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {collapsed ? (
              <motion.button
                key="active-only"
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                aria-label="Open navigation"
                className="size-11 rounded-full flex items-center justify-center"
              >
                <span style={{ color: ACCENT, display: "flex" }}>
                  <ActiveIcon className="size-5" strokeWidth={1.75} />
                </span>
              </motion.button>
            ) : (
              <motion.button
                key="create"
                layout
                whileTap={{ scale: 0.92 }}
                onClick={onCreate}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                aria-label="Create event"
                className="mx-1 size-12 rounded-full flex items-center justify-center text-white shrink-0"
                style={{
                  background: `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DEEP} 100%)`,
                  boxShadow:
                    "0 6px 20px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                <Plus className="size-6" strokeWidth={2.2} />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Right tabs */}
          <AnimatePresence mode="popLayout" initial={false}>
            {!collapsed &&
              items.slice(2).map((it) => (
                <motion.div
                  key={it.key}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 380, damping: 28 }}
                >
                  <Tab
                    it={it}
                    active={active === it.key}
                    badge={badges?.[it.key]}
                    onClick={() => onChange(it.key)}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function Tab<K extends string>({
  it,
  active,
  badge,
  onClick,
}: {
  it: OutsyNavItem<K>;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={it.label}
      aria-current={active ? "page" : undefined}
      className="relative h-11 px-3 rounded-full flex items-center justify-center"
    >
      {active && (
        <motion.div
          layoutId="opt9-indicator"
          className="absolute inset-0 rounded-full"
          style={{
            background: "rgba(94,168,255,0.18)",
            border: "1px solid rgba(94,168,255,0.35)",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <span
        className="relative flex"
        style={{ color: active ? ACCENT : "rgba(255,255,255,0.65)" }}
      >
        <it.Icon className="size-5" strokeWidth={1.75} />
      </span>
      {!!badge && !active && (
        <span
          aria-label="unread"
          className="absolute top-1.5 right-2 size-2 rounded-full"
          style={{ background: BADGE, boxShadow: "0 0 0 2px #14161c" }}
        />
      )}
    </button>
  );
}

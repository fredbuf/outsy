"use client";

import {
  useState,
  useEffect,
  useRef,
  type RefObject,
  type ComponentType,
  type ReactNode,
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
 * OutsyNav — production floating navigation (based on explorer "Option 11").
 *
 * A soft glass dock where only the ACTIVE tab expands to show its label in a
 * tinted highlight pill; the rest stay icon-only. Create is a blue FAB in the
 * middle. On scroll-down the dock collapses in place — one persistent glass
 * pill: the side tabs scale out, the center slot morphs from the Create FAB
 * into an active-icon circle, and the pill contracts and glides to the
 * bottom-left in a single spring. Scroll-up (or tapping it) reverses the
 * same motion. A contextual "Search events" chip appears whenever `onSearch`
 * is provided (pass it only on the tab where search makes sense).
 *
 * Fully controlled: you own `active` and pass `onChange`. `active` may be
 * null when no tab matches the current route. Wire `onCreate` and `onSearch`
 * to your handlers. Point `scrollContainerRef` at whichever element actually
 * scrolls; leave it undefined to use the window scroll.
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
  /** Tab set. Exactly 4 items — the Create FAB renders between items 2 and 3. */
  items?: OutsyNavItem<K>[];
}

const USER_ITEMS: OutsyNavItem[] = [
  { key: "home", label: "Home", Icon: House },
  { key: "map", label: "Map", Icon: Compass },
  { key: "schedule", label: "Schedule", Icon: CalendarDays },
  { key: "inbox", label: "Inbox", Icon: MessageSquare },
];

// Soft, dark glass surface shared by the dock and collapsed FAB.
const GLASS = {
  background: "rgba(28,30,38,0.62)",
  backdropFilter: "blur(28px) saturate(140%)",
  WebkitBackdropFilter: "blur(28px) saturate(140%)",
} as const;

const ACCENT = "var(--accent-blue, #5EA8FF)";
const ACCENT_DEEP = "var(--accent-blue-deep, #2563E2)";
const BADGE = "var(--badge-red, #FF4D4F)";

// One spring drives every part of the collapse so it reads as a single motion.
const SPRING = { type: "spring", stiffness: 340, damping: 30 } as const;

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
    // `bottom-nav outsy-nav` — targeted by BottomNavContext (data-hidden) and
    // by body:has(.bottom-nav) content clearance in globals.css.
    // pointer-events-none so the full-width strip never blocks page content;
    // interactive children re-enable pointer events themselves.
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
        {/* One persistent pill. The justify toggle above moves its layout
            slot; `layout` FLIP-animates the glide while the tab groups
            collapse their width and the center slot morphs FAB → active
            icon, all on the same spring. */}
        <motion.div
          layout
          transition={SPRING}
          className="pointer-events-auto flex items-center px-1.5 py-1.5 rounded-full border border-white/10 shadow-[0_12px_36px_rgba(0,0,0,0.55)]"
          style={GLASS}
        >
          <TabGroup collapsed={collapsed}>
            {items.slice(0, 2).map((it) => (
              <Tab
                key={it.key}
                it={it}
                active={active === it.key}
                badge={badges?.[it.key]}
                onClick={() => onChange(it.key)}
              />
            ))}
          </TabGroup>

          {/* Center slot: Create FAB when expanded, active-icon circle
              (revealing the pill's own glass) when collapsed. */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={collapsed ? expand : onCreate}
            aria-label={collapsed ? "Open navigation" : "Create event"}
            className="relative mx-0.5 rounded-full flex items-center justify-center text-white shrink-0"
            initial={false}
            animate={{ width: collapsed ? 44 : 40, height: collapsed ? 44 : 40 }}
            transition={SPRING}
          >
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: `linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DEEP} 100%)`,
                boxShadow:
                  "0 6px 20px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.3)",
              }}
              initial={false}
              animate={{ opacity: collapsed ? 0 : 1, scale: collapsed ? 0.8 : 1 }}
              transition={SPRING}
            />
            <motion.span
              className="relative flex"
              initial={false}
              animate={{
                opacity: collapsed ? 0 : 1,
                rotate: collapsed ? -90 : 0,
                scale: collapsed ? 0.5 : 1,
              }}
              transition={SPRING}
            >
              <Plus className="size-5" strokeWidth={2.2} />
            </motion.span>
            <motion.span
              className="absolute flex"
              style={{ color: ACCENT }}
              initial={false}
              animate={{
                opacity: collapsed ? 1 : 0,
                rotate: collapsed ? 0 : 90,
                scale: collapsed ? 1 : 0.5,
              }}
              transition={SPRING}
            >
              <ActiveIcon className="size-5" strokeWidth={1.9} />
            </motion.span>
          </motion.button>

          <TabGroup collapsed={collapsed}>
            {items.slice(2).map((it) => (
              <Tab
                key={it.key}
                it={it}
                active={active === it.key}
                badge={badges?.[it.key]}
                onClick={() => onChange(it.key)}
              />
            ))}
          </TabGroup>
        </motion.div>
      </div>
    </div>
  );
}

// A side of the dock. Collapses by animating width → 0 while scaling/fading
// out, so the pill contracts around the center slot. `inert` drops the hidden
// tabs from the tab order and pointer events while they stay mounted.
function TabGroup({
  collapsed,
  children,
}: {
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      inert={collapsed}
      className="flex items-center gap-0.5 overflow-hidden"
      initial={false}
      animate={
        collapsed
          ? { width: 0, opacity: 0, scale: 0.6 }
          : { width: "auto", opacity: 1, scale: 1 }
      }
      transition={SPRING}
    >
      {children}
    </motion.div>
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
    <motion.button
      layout
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      aria-label={it.label}
      aria-current={active ? "page" : undefined}
      className="relative h-9 rounded-full flex items-center justify-center overflow-hidden"
      style={{ paddingLeft: 10, paddingRight: 10 }}
    >
      {active && (
        <motion.div
          layoutId="outsy-nav-indicator"
          className="absolute inset-0 rounded-full"
          style={{
            background: `color-mix(in srgb, ${ACCENT} 20%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ACCENT} 38%, transparent)`,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}

      <div className="relative flex items-center gap-1.5">
        <div
          className="relative"
          style={{ color: active ? ACCENT : "rgba(255,255,255,0.6)" }}
        >
          <it.Icon className="size-[18px]" strokeWidth={1.85} />
          {!!badge && !active && (
            <span
              className="absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-[#1c1e26]"
              style={{ background: BADGE }}
            />
          )}
        </div>

        {/* Label only morphs in for the active tab — the slick part. */}
        <AnimatePresence initial={false}>
          {active && (
            <motion.span
              key="label"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="whitespace-nowrap overflow-hidden"
              style={{ fontSize: 11.5, color: ACCENT }}
            >
              {it.label}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}

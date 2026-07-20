import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { House, Compass, Plus, CalendarDays, MessageSquare } from "lucide-react";
import { ScrollContent, useScrollRef } from "./scroll-content";
import { SearchChip } from "./search-chip";

const items = [
  { key: "home", label: "Home", Icon: House },
  { key: "explore", label: "Explore", Icon: Compass },
  { key: "schedule", label: "Schedule", Icon: CalendarDays },
  { key: "inbox", label: "Inbox", Icon: MessageSquare },
];

// Option 9 — Glass Pill · Morphs to Active (bottom-left)
// Uses Option 1's understated glass. On scroll the pill collapses in place:
// the side tabs and Create scale out, the bar contracts around the active
// icon, then the whole pill glides to the bottom-left as one continuous
// surface. Tap it (or scroll up) to glide back and re-expand.
export function MenuOption9() {
  const [active, setActive] = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useScrollRef();
  const lastY = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y > lastY.current + 4 && y > 50) setCollapsed(true);
      else if (y < lastY.current - 4) setCollapsed(false);
      lastY.current = y;
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  const ActiveIcon = items.find((i) => i.key === active)?.Icon ?? House;

  return (
    <>
      <ScrollContent scrollRef={scrollRef} />

      <SearchChip visible={active === "home" && !collapsed} />

      {/* Wrapper switches alignment; the pill's `layout` prop animates the move. */}
      <div
        className={`absolute inset-x-0 bottom-0 flex pb-5 ${
          collapsed ? "justify-start pl-5" : "justify-center"
        }`}
      >
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={() => collapsed && setCollapsed(false)}
          className="flex items-center gap-1 px-2 py-2 rounded-full border border-white/10 shadow-[0_10px_32px_rgba(0,0,0,0.5)]"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
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
                  <Tab it={it} active={active === it.key} onClick={() => setActive(it.key)} />
                </motion.div>
              ))}
          </AnimatePresence>

          {/* The morph anchor: this slot always holds something.
              Expanded → Create FAB. Collapsed → the active section icon. */}
          <AnimatePresence mode="popLayout" initial={false}>
            {collapsed ? (
              <motion.button
                key="active-only"
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="size-11 rounded-full flex items-center justify-center"
              >
                <ActiveIcon className="size-5 text-[#5EA8FF]" strokeWidth={1.75} />
              </motion.button>
            ) : (
              <motion.button
                key="create"
                layout
                whileTap={{ scale: 0.92 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                className="mx-1 size-12 rounded-full flex items-center justify-center text-white shrink-0"
                style={{
                  background: "linear-gradient(180deg, #5EA8FF 0%, #2563E2 100%)",
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
                  <Tab it={it} active={active === it.key} onClick={() => setActive(it.key)} />
                </motion.div>
              ))}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}

function Tab({ it, active, onClick }: { it: any; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative h-11 px-3 rounded-full flex items-center justify-center">
      {active && (
        <motion.div
          layoutId="opt9-indicator"
          className="absolute inset-0 rounded-full"
          style={{ background: "rgba(94,168,255,0.18)", border: "1px solid rgba(94,168,255,0.35)" }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        />
      )}
      <it.Icon
        className={`relative size-5 ${active ? "text-[#5EA8FF]" : "text-white/65"}`}
        strokeWidth={1.75}
      />
    </button>
  );
}

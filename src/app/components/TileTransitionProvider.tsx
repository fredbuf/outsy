/* eslint-disable @next/next/no-img-element */
"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type TileRect = { top: number; right: number; bottom: number; left: number };

export type TransitionData = {
  rect: TileRect;
  imageUrl: string | null;
  category: string;
};

type Phase = "entering" | "holding" | "fading";

type Ctx = {
  /** Fire this on tile tap — records rect + image, starts the expand animation. */
  triggerTransition: (data: TransitionData) => void;
  /**
   * True while the expansion overlay is on screen.
   * Event pages read this to start their hero hidden and reveal it as the overlay
   * fades out for a seamless image hand-off.
   */
  isTransitioning: boolean;
};

// ── Context ───────────────────────────────────────────────────────────────────

const TileTransitionContext = createContext<Ctx>({
  triggerTransition: () => {},
  isTransitioning: false,
});

export function useTileTransition(): Ctx {
  return useContext(TileTransitionContext);
}

// ── Category fallback background (mirrors EventsList + PublicEventSwipePage) ──

function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts":
    case "music":
      return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":
      return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture":
    case "art":
      return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":
      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":
      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":
      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:
      return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

// ── Overlay ───────────────────────────────────────────────────────────────────
// position:fixed, full viewport. Starts clipped to the tile rect via
// clip-path:inset() then animates to the full viewport. All transitions are
// transform/opacity/clip-path — no layout thrashing, GPU-composited on Safari.

function TileOverlay({
  data,
  phase,
}: {
  data: TransitionData;
  phase: Phase;
}) {
  const divRef = useRef<HTMLDivElement>(null);
  const { rect, imageUrl, category } = data;

  // On first paint: snap to tile rect, then on the next two animation frames
  // trigger the clip-path expansion. Double-rAF forces a style flush before
  // the transition starts (required by browsers to interpolate from the snap).
  useLayoutEffect(() => {
    const el = divRef.current;
    if (!el) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Inset values: clip the full-viewport element down to the tile's rect.
    const r = Math.max(0, vw - rect.right);
    const b = Math.max(0, vh - rect.bottom);
    const t = Math.max(0, rect.top);
    const l = Math.max(0, rect.left);

    const startClip = `inset(${t}px ${r}px ${b}px ${l}px round 14px)`;
    const endClip = "inset(0px 0px 0px 0px round 0px)";

    // Snap to tile position — no transition yet
    el.style.clipPath = startClip;
    el.style.transition = "none";
    el.style.opacity = "1";

    // Two rAFs: 1st flushes the snap, 2nd applies the animated expansion
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition =
          "clip-path 0.34s cubic-bezier(0.32, 0.72, 0, 1)";
        el.style.clipPath = endClip;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only runs once on mount — that's intentional

  // Fade out when phase becomes "fading"
  useEffect(() => {
    const el = divRef.current;
    if (!el || phase !== "fading") return;
    el.style.transition = "opacity 0.22s ease-in";
    el.style.opacity = "0";
  }, [phase]);

  return (
    <div
      ref={divRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        pointerEvents: "none",
        overflow: "hidden",
        background: categoryBg(category),
        willChange: "clip-path, opacity",
      }}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      )}
      {/* Scrim matching the event hero's bottom gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to bottom, rgba(11,15,20,0.18) 0%, transparent 22%, transparent 52%, rgba(11,15,20,0.92) 100%)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function TileTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<TransitionData | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);

  const startTimeRef = useRef(0);
  const [instanceKey, setInstanceKey] = useState(0); // forces TileOverlay remount on each new tap
  const pathname = usePathname();
  const prevPathnameRef = useRef<string | null>(null);
  const phaseRef = useRef(phase);

  // Keep phaseRef current via effect (not during render) so the pathname effect
  // can read the latest phase without it being a stale closure dependency.
  useEffect(() => {
    phaseRef.current = phase;
  });

  // ── Route-change detection ─────────────────────────────────────────────────
  // When Next.js finishes navigating the pathname changes. We wait for the
  // expansion animation to finish (min 360 ms) then start the fade-out.
  useEffect(() => {
    if (prevPathnameRef.current === null) {
      prevPathnameRef.current = pathname;
      return;
    }
    if (pathname === prevPathnameRef.current) return;
    prevPathnameRef.current = pathname;

    const p = phaseRef.current;
    if (p === "entering" || p === "holding") {
      const elapsed = Date.now() - startTimeRef.current;
      const MIN_MS = 360; // clip-path animation is 340 ms + buffer
      const delay = Math.max(0, MIN_MS - elapsed);
      setTimeout(() => setPhase("fading"), delay);
    }
  }, [pathname]);

  // "entering" → "holding" after the clip-path animation finishes (340 ms)
  useEffect(() => {
    if (phase !== "entering") return;
    const t = setTimeout(() => setPhase("holding"), 350);
    return () => clearTimeout(t);
  }, [phase]);

  // "fading" → cleanup after the fade-out animation finishes (220 ms)
  useEffect(() => {
    if (phase !== "fading") return;
    const t = setTimeout(() => {
      setPhase(null);
      setData(null);
    }, 260);
    return () => clearTimeout(t);
  }, [phase]);

  // Safety net: if navigation stalls, force fade-out after 2.5 s
  useEffect(() => {
    if (phase !== "entering") return;
    const t = setTimeout(() => setPhase("fading"), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  const triggerTransition = useCallback((d: TransitionData) => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const now = Date.now();
    startTimeRef.current = now;
    setInstanceKey(now);
    setData(d);
    setPhase("entering");
  }, []);

  const isTransitioning = phase !== null;

  return (
    <TileTransitionContext.Provider value={{ triggerTransition, isTransitioning }}>
      {children}
      {phase !== null && data !== null && (
        <TileOverlay
          key={instanceKey}
          data={data}
          phase={phase}
        />
      )}
    </TileTransitionContext.Provider>
  );
}

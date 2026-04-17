"use client";

import { createContext, useContext, useRef, useCallback } from "react";

type BottomNavContextValue = {
  hide: () => void;
  show: () => void;
};

const BottomNavContext = createContext<BottomNavContextValue>({
  hide: () => {},
  show: () => {},
});

export function useBottomNav() {
  return useContext(BottomNavContext);
}

// Keeps a ref-based count of concurrent "hide" callers so that two overlays
// opening at the same time don't show the nav when only one closes.
export function BottomNavProvider({ children }: { children: React.ReactNode }) {
  const countRef = useRef(0);
  const navRef = useRef<HTMLElement | null>(null);

  const apply = useCallback((hidden: boolean) => {
    // Locate the nav lazily — avoids tight coupling to DOM structure.
    if (!navRef.current) {
      navRef.current = document.querySelector(".bottom-nav");
    }
    const el = navRef.current;
    if (!el) return;
    if (hidden) {
      el.setAttribute("data-hidden", "true");
    } else {
      el.removeAttribute("data-hidden");
    }
  }, []);

  const hide = useCallback(() => {
    countRef.current += 1;
    apply(true);
  }, [apply]);

  const show = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    if (countRef.current === 0) apply(false);
  }, [apply]);

  return (
    <BottomNavContext.Provider value={{ hide, show }}>
      {children}
    </BottomNavContext.Provider>
  );
}

"use client";
import { useEffect } from "react";

/** Drop inside any server-component page to toggle a body class on mount. */
export default function SetBodyClass({ className }: { className: string }) {
  useEffect(() => {
    document.body.classList.add(className);
    return () => { document.body.classList.remove(className); };
  }, [className]);
  return null;
}

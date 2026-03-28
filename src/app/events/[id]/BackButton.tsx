"use client";

import { useRouter } from "next/navigation";

export function BackButton({
  style,
  children,
}: {
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function handleBack() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/events");
    }
  }

  return (
    <button
      type="button"
      aria-label="Go back"
      onClick={handleBack}
      style={style}
    >
      {children}
    </button>
  );
}

"use client";

import { useRouter } from "next/navigation";

export function BackButton({
  style,
  className,
  onClick,
  children,
}: {
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const router = useRouter();

  function handleBack() {
    if (onClick) { onClick(); return; }
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
      className={className}
    >
      {children}
    </button>
  );
}

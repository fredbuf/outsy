/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";

// ── AppTopBar ──────────────────────────────────────────────────────────────────
// Transparent top bar for immersive dark pages (e.g. /events).
// Left:  location pin + city name
// Right: avatar → /profile  (sign-in trigger for guests)

export function AppTopBar() {
  const { user, loading } = useAuth();

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  const meta = user?.user_metadata as { avatar_url?: string; full_name?: string } | undefined;

  // Local override: updated immediately when the user changes their avatar.
  // This is the reliable path — user_metadata.avatar_url comes from the OAuth
  // provider (e.g. Google) and may not reflect Outsy-specific uploads even
  // after a session refresh, because the JWT is generated from cached claims.
  // The "outsy:avatar-updated" event is dispatched by profile/page.tsx right
  // after a successful upload, so this override wins on the same tick.
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);

  useEffect(() => {
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail?.url;
      if (url) setAvatarOverride(url);
    }
    window.addEventListener("outsy:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("outsy:avatar-updated", onAvatarUpdated);
  }, []);

  // avatarOverride takes precedence; fall back to the OAuth-provided URL.
  const avatarUrl = avatarOverride ?? meta?.avatar_url;
  const initials = (() => {
    const name = meta?.full_name;
    if (!name) return (user?.email?.[0] ?? "?").toUpperCase();
    return name
      .split(" ")
      .slice(0, 2)
      .map((p: string) => p[0])
      .join("")
      .toUpperCase();
  })();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 0",
      }}
    >
      {/* ── Location label ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 25, fontWeight: 900, color: "#F5F7FA", letterSpacing: "-0.03em", lineHeight: 1 }}>
          Montréal
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden style={{ flexShrink: 0, marginTop: 3 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="#8C98A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* ── Avatar / sign-in ── */}
      {loading ? (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        />
      ) : user ? (
        <Link
          href="/profile"
          aria-label="Your profile"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.08)",
            overflow: "hidden",
            background: "rgba(18,26,36,0.70)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            textDecoration: "none",
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#F5F7FA" }}>
              {initials}
            </span>
          )}
        </Link>
      ) : (
        <button
          onClick={openSignIn}
          style={{
            padding: "7px 16px",
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(18,26,36,0.70)",
            color: "#C7D0DB",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          }}
        >
          Sign in
        </button>
      )}
    </div>
  );
}

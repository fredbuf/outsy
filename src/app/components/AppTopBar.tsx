/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
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
  const avatarUrl = meta?.avatar_url;
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          color: "#F5F7FA",
        }}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8C98A8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
          aria-hidden
        >
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.025em", color: "#F5F7FA" }}>
          Montréal
        </span>
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

/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── AppTopBar ──────────────────────────────────────────────────────────────────
// Transparent top bar for immersive dark pages (e.g. /events).
// Left:  location pin + city name
// Right: avatar → /profile  (sign-in trigger for guests)

export function AppTopBar() {
  const { user, loading } = useAuth();
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropOpen]);

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  async function handleSignOut() {
    setDropOpen(false);
    await supabaseBrowser().auth.signOut();
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
          gap: 6,
          color: "#eae8e4",
        }}
      >
        {/* Location pin */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.7, flexShrink: 0 }}
          aria-hidden
        >
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>
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
          }}
        />
      ) : user ? (
        <div ref={dropRef} style={{ position: "relative" }}>
          <button
            onClick={() => setDropOpen((v) => !v)}
            aria-label="Account menu"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "2px solid rgba(167,139,250,0.55)",
              overflow: "hidden",
              cursor: "pointer",
              background: "rgba(124,58,237,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>
                {initials}
              </span>
            )}
          </button>

          {dropOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 8px)",
                right: 0,
                minWidth: 160,
                background: "rgba(18,14,30,0.92)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
                overflow: "hidden",
                zIndex: 300,
              }}
            >
              <Link
                href="/profile"
                onClick={() => setDropOpen(false)}
                style={{
                  display: "block",
                  padding: "11px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#eae8e4",
                  textDecoration: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Profile
              </Link>
              <button
                onClick={handleSignOut}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "11px 16px",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "rgba(234,232,228,0.65)",
                  textAlign: "left",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={openSignIn}
          style={{
            padding: "7px 14px",
            borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.07)",
            color: "#eae8e4",
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

/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useActiveOrganizer } from "./ActiveOrganizerContext";

// ── AppTopBar ──────────────────────────────────────────────────────────────────
// Transparent top bar for immersive dark pages (e.g. /events).
// Left:  location pin + city name
// Right: avatar → /profile  (sign-in trigger for guests)

export function AppTopBar() {
  const { user, loading, session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  const meta = user?.user_metadata as { avatar_url?: string; full_name?: string } | undefined;

  // profileAvatar: loaded on mount from /api/profile (Supabase profiles table).
  // This is the source of truth — it reflects Outsy-specific uploads.
  // avatarOverride: set immediately when the user uploads a new avatar on the
  // same session (via the "outsy:avatar-updated" custom event), so the Home
  // avatar updates without a reload.
  //
  // Priority: avatarOverride → profileAvatar → meta.avatar_url (Google OAuth fallback)
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);

  // Fetch Supabase profile avatar on mount / whenever the user changes.
  useEffect(() => {
    if (!user || !session) return;
    fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        // /api/profile returns { ok, profile: { avatar_url, ... }, ... }
        if (data?.profile?.avatar_url) setProfileAvatar(data.profile.avatar_url);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Listen for immediate avatar-updated events dispatched after upload.
  useEffect(() => {
    function onAvatarUpdated(e: Event) {
      const url = (e as CustomEvent<{ url: string }>).detail?.url;
      if (url) setAvatarOverride(url);
    }
    window.addEventListener("outsy:avatar-updated", onAvatarUpdated);
    return () => window.removeEventListener("outsy:avatar-updated", onAvatarUpdated);
  }, []);

  const avatarUrl = avatarOverride ?? profileAvatar ?? meta?.avatar_url;
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

  // Derived organizer logo color (same deterministic hash used across the app).
  const ORG_LOGO_COLORS = ["#1e3a5f","#2d4a1e","#4a1e2d","#1e2d4a","#3a2d1e","#1e4a3a"];
  function orgLogoColor(name: string) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return ORG_LOGO_COLORS[h % ORG_LOGO_COLORS.length];
  }

  // When in organizer mode, tap target goes to the org's public profile page.
  const avatarHref = activeOrganizer
    ? (activeOrganizer.slug ? `/o/${activeOrganizer.slug}` : `/dashboard/organizers/${activeOrganizer.organizerId}/edit`)
    : "/profile";

  const avatarLabel = activeOrganizer ? `${activeOrganizer.name} organizer profile` : "Your profile";

  return (
    <div style={{ display: "flex", padding: "4px 0" }}>
      {/* ── Location label ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
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
            borderRadius: activeOrganizer ? 9 : "50%",
            background: "rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        />
      ) : user ? (
        activeOrganizer ? (
          /* ── Organizer identity ── rounded-square logo */
          <Link
            href={avatarHref}
            aria-label={avatarLabel}
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              border: "1.5px solid rgba(94,168,255,0.30)",
              overflow: "hidden",
              background: orgLogoColor(activeOrganizer.name),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              textDecoration: "none",
            }}
          >
            {activeOrganizer.image_url ? (
              <img
                src={activeOrganizer.image_url}
                alt={activeOrganizer.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.90)", userSelect: "none" }}>
                {activeOrganizer.name.slice(0, 1).toUpperCase()}
              </span>
            )}
          </Link>
        ) : (
          /* ── Personal identity ── circular avatar */
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
        )
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

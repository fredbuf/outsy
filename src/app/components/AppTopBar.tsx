/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { useActiveOrganizer } from "./ActiveOrganizerContext";
import { avatarGradient } from "./GeneratedAvatar";

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

  const meta = user?.user_metadata as { full_name?: string } | undefined;

  // avatarOverride: set immediately when the user uploads a new avatar in
  // this session (via "outsy:avatar-updated" custom event).
  // profileAvatar:  custom_avatar_url fetched from /api/profile on mount.
  // profileLoaded:  true once the fetch has settled (success or error).
  //
  // Render priority:
  //   1. avatarOverride  — instant post-upload feedback
  //   2. profileAvatar   — custom_avatar_url from DB
  //   3. gradient initials — only shown AFTER fetch settles with no custom avatar
  //   4. neutral skeleton — shown while fetch is in flight
  //
  // Google / OAuth avatar_url is never consulted at any step.
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<string | null>(null);
  const [orgImageOverride, setOrgImageOverride] = useState<string | null>(null);

  // Fetch custom_avatar_url on mount / when the user changes.
  // Reset loaded state first so the skeleton shows while the new fetch is in flight.
  useEffect(() => {
    if (!user || !session) return;
    setProfileAvatar(null);
    setProfileLoaded(false);
    fetch("/api/profile", { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.profile?.custom_avatar_url) setProfileAvatar(data.profile.custom_avatar_url);
        setProfileLoaded(true);
      })
      .catch(() => { setProfileLoaded(true); });
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

  // Listen for organizer image updates dispatched after upload.
  useEffect(() => {
    function onOrgImageUpdated(e: Event) {
      const { organizerId: updatedId, url } = (e as CustomEvent<{ organizerId: string; url: string }>).detail ?? {};
      if (url && updatedId === activeOrganizer?.organizerId) setOrgImageOverride(url);
    }
    window.addEventListener("outsy:org-image-updated", onOrgImageUpdated);
    return () => window.removeEventListener("outsy:org-image-updated", onOrgImageUpdated);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganizer?.organizerId]);

  const avatarUrl = avatarOverride ?? profileAvatar ?? null;
  // avatarReady: true once we know what to show. avatarOverride bypasses the
  // profile fetch wait so post-upload feedback is instant.
  const avatarReady = avatarOverride !== null || profileLoaded;
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
              background: avatarGradient(activeOrganizer.name),
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.28)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              textDecoration: "none",
            }}
          >
            {(orgImageOverride ?? activeOrganizer.custom_image_url) ? (
              <img
                src={orgImageOverride ?? activeOrganizer.custom_image_url!}
                alt={activeOrganizer.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.02em", color: "#ffffff", userSelect: "none" }}>
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
              background: !avatarReady || avatarUrl ? "transparent" : avatarGradient(meta?.full_name ?? user?.email?.split("@")[0] ?? null),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              textDecoration: "none",
            }}
          >
            {!avatarReady ? (
              /* Skeleton while profile fetch is in flight — never flashes Google photo */
              <div style={{ width: "100%", height: "100%", background: "rgba(255,255,255,0.08)" }} />
            ) : avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "-0.02em", color: "#ffffff", userSelect: "none" }}>
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

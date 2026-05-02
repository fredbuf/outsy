/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { useActiveOrganizer } from "../components/ActiveOrganizerContext";
import { useBottomNav } from "../components/BottomNavContext";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Types ──────────────────────────────────────────────────────────────────────

type Profile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type EventRow = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  image_url: string | null;
  visibility: string;
  is_approved: boolean;
  status: string;
};

type FriendProfile = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];


function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Icons ──────────────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// ── Skeleton loading ───────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <main
      className="page-main"
      style={{ maxWidth: 640, margin: "0 auto", padding: "24px 16px 56px", display: "grid", gap: 32 }}
    >
      {/* Identity block skeleton */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>
        <div className="skeleton" style={{ width: 96, height: 96, borderRadius: "50%", background: "var(--surface-raised)" }} />
        <div className="skeleton" style={{ width: 148, height: 22, borderRadius: 8, background: "var(--surface-raised)" }} />
        <div className="skeleton" style={{ width: 80, height: 14, borderRadius: 6, background: "var(--surface-raised)" }} />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <div className="skeleton" style={{ width: 118, height: 38, borderRadius: 20, background: "var(--surface-raised)" }} />
          <div className="skeleton" style={{ width: 118, height: 38, borderRadius: 20, background: "var(--surface-raised)" }} />
        </div>
      </div>
      {/* Counter skeleton */}
      <div className="skeleton" style={{ width: 280, height: 52, borderRadius: 14, background: "var(--surface-raised)" }} />
    </main>
  );
}

// ── Detail sheet wrapper ────────────────────────────────────────────────────────

function DetailSheet({
  title,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder,
  children,
}: {
  title: string;
  onClose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(() => onClose(), 260);
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      style={{
        position: "fixed", inset: 0,
        background: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex", alignItems: "flex-end",
        transition: "background 0.22s ease",
      }}
    >
      <div
        className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
        style={{
          background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "24px 24px 0 0",
          width: "100%",
          /*
           * Fixed height (not maxHeight) so the sheet never resizes when result
           * count changes. dvh accounts for the software keyboard so the sheet
           * always fits the visible area.
           */
          height: "88dvh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
        </div>

        {/* 3-column header */}
        <div style={{
          display: "grid", gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center", padding: "8px 16px 10px",
          flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)",
              cursor: "pointer", color: "rgba(255,255,255,0.78)",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div style={{ textAlign: "center", fontSize: 17, fontWeight: 600, color: "#FFFFFF" }}>
            {title}
          </div>
          <div />
        </div>

        {/* Search — flexShrink:0 keeps it anchored at the top while keyboard is open */}
        <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 14, padding: "0 14px", height: 50,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="detail-sheet-search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontSize: 16, color: "#FFFFFF",
              }}
            />
          </div>
        </div>

        {/* Results — only this div scrolls */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 16px max(24px, env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, loading: authLoading, session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [goingEvents, setGoingEvents] = useState<EventRow[]>([]);
  const [interestedEvents, setInterestedEvents] = useState<EventRow[]>([]);
  const [fetching, setFetching] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editClosing, setEditClosing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [activeSheet, setActiveSheet] = useState<"friends" | "following" | "events" | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activeOrganizer, setActiveOrganizer, identityLoading, orgPages } = useActiveOrganizer();

  useEffect(() => {
    if (authLoading || !session?.access_token) return;
    setFetching(true);
    const token = session.access_token;
    Promise.all([
      fetch("/api/profile", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/friends", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([profileJson, friendsJson]) => {
        if (profileJson?.ok) {
          setProfile(profileJson.profile);
          setEvents(profileJson.events ?? []);
          setGoingEvents(profileJson.going ?? []);
          setInterestedEvents(profileJson.interested ?? []);
          setDisplayName(profileJson.profile?.display_name ?? "");
          setUsername(profileJson.profile?.username ?? "");
        }
        if (friendsJson?.ok) {
          setFriends(friendsJson.friends ?? []);
        }
      })
      .finally(() => setFetching(false));
  }, [authLoading, session?.access_token]);

  const { hide: hideNav, show: showNav } = useBottomNav();

  useEffect(() => {
    document.body.style.overflow = (editOpen || editClosing || activeSheet !== null || settingsOpen) ? "hidden" : "";
    document.body.classList.toggle("settings-open", settingsOpen);
    if (editOpen || editClosing || activeSheet !== null || settingsOpen) { hideNav(); } else { showNav(); }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("settings-open");
      showNav();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOpen, editClosing, activeSheet, settingsOpen]);

  // Restore active sheet from URL on mount (e.g. returning via back button)
  useEffect(() => {
    const sheet = new URLSearchParams(window.location.search).get("sheet");
    if (sheet === "friends" || sheet === "following" || sheet === "events") {
      setActiveSheet(sheet);
    }
  }, []);

  async function handleSignOut() {
    setSettingsOpen(false);
    await supabaseBrowser().auth.signOut();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ display_name: displayName, username }),
    });
    const json = await res.json();
    setSaving(false);

    if (json?.ok) {
      setProfile(json.profile);
      setUsername(json.profile?.username ?? "");
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        closeEdit();
      }, 1200);
    } else {
      setSaveError(json?.error ?? "Failed to save.");
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file || !session?.access_token) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/profile/upload-avatar", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}` },
      body: fd,
    });
    const json = await res.json();
    setUploadingAvatar(false);
    if (json?.ok) {
      setProfile((prev) => (prev ? { ...prev, avatar_url: json.url } : prev));
      // Notify all listeners (e.g. AppTopBar) that the avatar has changed.
      // This is more reliable than relying on JWT refresh propagation because
      // user_metadata in the Supabase JWT comes from the OAuth provider and
      // admin-side metadata writes may not be reflected before the token is
      // refreshed. The custom event sidesteps the JWT entirely.
      window.dispatchEvent(
        new CustomEvent("outsy:avatar-updated", { detail: { url: json.url as string } })
      );
      supabaseBrowser().auth.refreshSession().catch(() => {});
    } else {
      setAvatarError(json?.error ?? "Upload failed.");
    }
  }

  function closeEdit() {
    setEditClosing(true);
    setTimeout(() => { setEditOpen(false); setEditClosing(false); }, 200);
  }

  function handleShare() {
    const url = profile?.username
      ? `${window.location.origin}/u/${profile.username}`
      : window.location.href;
    if (navigator.share) {
      navigator.share({ title: profile?.display_name ?? "Profile", url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareMsg("Link copied!");
        setTimeout(() => setShareMsg(null), 2000);
      });
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (authLoading || fetching) {
    return <ProfileSkeleton />;
  }

  // ── Signed-out ────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "64px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "var(--surface-raised)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.4,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Your profile</h1>
        <p style={{ opacity: 0.55, margin: 0, lineHeight: 1.6, fontSize: 15 }}>Sign in to view and edit your profile.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            marginTop: 4,
            padding: "11px 28px",
            borderRadius: 12,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  const avatarLabel = profile?.display_name ?? user.email?.split("@")[0] ?? null;

  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        minHeight: "100dvh",
        display: "grid",
        gap: 36,
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
      />

      {/* ── Identity block ─────────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8, position: "relative" }}>
        {/* Settings button — top-right */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--border-strong)",
            background: "var(--surface-subtle)",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            opacity: 0.7,
          }}
        >
          <GearIcon />
        </button>

        {/* Avatar */}
        <div style={{ position: "relative", width: 96, height: 96 }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={avatarLabel ?? ""}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                objectFit: "cover",
                display: "block",
                border: "2px solid var(--border-medium)",
              }}
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: getAvatarColor(avatarLabel),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 32,
                fontWeight: 700,
                color: "#fff",
                userSelect: "none",
                border: "2px solid var(--border-medium)",
              }}
            >
              {getInitials(avatarLabel)}
            </div>
          )}

          {/* Camera button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change photo"
            style={{
              position: "absolute",
              bottom: 2,
              right: 2,
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "2px solid var(--background)",
              background: "var(--foreground)",
              color: "var(--background)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: uploadingAvatar ? "wait" : "pointer",
              opacity: uploadingAvatar ? 0.5 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <CameraIcon />
          </button>
        </div>

        {avatarError && (
          <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{avatarError}</p>
        )}

        {/* Name + username */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
            {profile?.display_name ?? avatarLabel ?? "Anonymous"}
          </div>
          {profile?.username && (
            <div style={{ fontSize: 14, opacity: 0.5, marginTop: 4 }}>
              @{profile.username}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 2, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="profile-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 22px",
              borderRadius: 20,
              border: "none",
              background: "var(--foreground)",
              color: "var(--background)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <EditIcon />
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="profile-btn-ghost"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "9px 22px",
              borderRadius: 20,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              color: "inherit",
            }}
          >
            <ShareIcon />
            {shareMsg ?? "Share"}
          </button>
        </div>

        {/* Summary counters */}
        <div
          style={{
            display: "flex",
            width: "100%",
            maxWidth: 300,
            marginTop: 8,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => { setActiveSheet("friends"); setSheetSearch(""); router.replace("/profile?sheet=friends", { scroll: false }); }}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{friends.length}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Friends</span>
          </button>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
          <button
            type="button"
            onClick={() => { setActiveSheet("following"); setSheetSearch(""); router.replace("/profile?sheet=following", { scroll: false }); }}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>0</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Following</span>
          </button>
          <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
          <button
            type="button"
            onClick={() => { setActiveSheet("events"); setSheetSearch(""); router.replace("/profile?sheet=events", { scroll: false }); }}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
          >
            <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{goingEvents.length + interestedEvents.length + events.length}</span>
            <span style={{ fontSize: 12, opacity: 0.5 }}>Events</span>
          </button>
        </div>

      </section>

      {/* ── Friends sheet ────────────────────────────────────────────────────── */}
      {activeSheet === "friends" && (
        <DetailSheet
          title={`Friends · ${friends.length}`}
          onClose={() => { setActiveSheet(null); router.replace("/profile", { scroll: false }); }}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search friends…"
        >
          {(() => {
            const q = sheetSearch.toLowerCase();
            const filtered = friends.filter(
              (f) =>
                !q ||
                (f.display_name ?? "").toLowerCase().includes(q) ||
                (f.username ?? "").toLowerCase().includes(q)
            );
            if (friends.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: "40px 0" }}>
                  <p style={{ opacity: 0.45, fontSize: 14, margin: "0 0 12px" }}>No friends yet.</p>
                  <Link
                    href="/friends/add"
                    onClick={() => setActiveSheet(null)}
                    style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}
                  >
                    Find friends →
                  </Link>
                </div>
              );
            }
            if (filtered.length === 0) {
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 120 }}>
                  <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>No results for &ldquo;{sheetSearch}&rdquo;</p>
                </div>
              );
            }
            return (
              <div>
                {filtered.map((f) => (
                  <Link
                    key={f.id}
                    href={f.username ? `/u/${f.username}` : `/profile/${f.id}`}
                    onClick={() => setActiveSheet(null)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", textDecoration: "none", color: "inherit", borderBottom: "1px solid rgba(255,255,255,0.07)", borderRadius: 2 }}
                  >
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: getAvatarColor(f.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {getInitials(f.display_name)}
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{f.display_name ?? "Unknown"}</div>
                      {f.username && <div style={{ fontSize: 12, opacity: 0.5 }}>@{f.username}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </DetailSheet>
      )}

      {/* ── Following sheet ──────────────────────────────────────────────────── */}
      {activeSheet === "following" && (
        <DetailSheet
          title="Following"
          onClose={() => { setActiveSheet(null); router.replace("/profile", { scroll: false }); }}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search…"
        >
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>Following venues and organizers coming soon.</p>
          </div>
        </DetailSheet>
      )}

      {/* ── Events sheet ─────────────────────────────────────────────────────── */}
      {activeSheet === "events" && (
        <DetailSheet
          title={`Events · ${goingEvents.length + interestedEvents.length + events.length}`}
          onClose={() => { setActiveSheet(null); router.replace("/profile", { scroll: false }); }}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search events…"
        >
          {(() => {
            const q = sheetSearch.toLowerCase();
            const filterEvt = (list: EventRow[]) =>
              list.filter((e) => !q || e.title.toLowerCase().includes(q));
            const fGoing = filterEvt(goingEvents);
            const fInterested = filterEvt(interestedEvents);
            const fHosting = filterEvt(events);
            const total = goingEvents.length + interestedEvents.length + events.length;
            if (total === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No events yet.</p>;
            }
            if (fGoing.length + fInterested.length + fHosting.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No results for &ldquo;{sheetSearch}&rdquo;</p>;
            }
            return (
              <div style={{ display: "grid", gap: 24 }}>
                {([
                  { label: "Going", list: fGoing },
                  { label: "Interested", list: fInterested },
                  { label: "Hosting", list: fHosting },
                ] as { label: string; list: EventRow[] }[])
                  .filter(({ list }) => list.length > 0)
                  .map(({ label, list }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
                      {list.map((e) => (
                        <Link
                          key={e.id}
                          href={`/events/${e.id}`}
                          onClick={() => setActiveSheet(null)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 2px", textDecoration: "none", color: "inherit", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
                        >
                          <div style={{ width: 44, height: 36, borderRadius: 8, overflow: "hidden", background: "var(--surface-raised)", flexShrink: 0 }}>
                            {e.image_url && (
                              <img src={e.image_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.title}</div>
                            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{formatDate(e.start_at)}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
              </div>
            );
          })()}
        </DetailSheet>
      )}

      {(editOpen || editClosing) && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeEdit()}
          style={{
            position: "fixed",
            inset: 0,
            background: editClosing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.62)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px 16px max(16px, env(safe-area-inset-bottom))",
            transition: "background 0.18s ease",
          }}
        >
          <div
            className={editClosing ? "modal-zoom-exit" : "modal-zoom-enter"}
            style={{
              background: "linear-gradient(160deg, #1c2535 0%, #0d1320 100%)",
              border: "1px solid rgba(255,255,255,0.09)",
              borderRadius: 24,
              width: "100%",
              maxWidth: 400,
              overflow: "hidden",
              boxShadow: "0 32px 80px rgba(0,0,0,0.60), 0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
          >
            {/* Header — 3-column grid */}
            <div style={{
              display: "grid", gridTemplateColumns: "44px 1fr 44px",
              alignItems: "center", padding: "14px 16px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
            }}>
              <button
                type="button"
                onClick={closeEdit}
                aria-label="Close"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)",
                  cursor: "pointer", color: "rgba(255,255,255,0.78)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 17, fontWeight: 600, color: "#FFFFFF" }}>
                Edit profile
              </div>
              <div />
            </div>

            {/* Avatar — centred hero section */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 20px 20px", gap: 12 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Change photo"
                style={{
                  position: "relative", background: "none", border: "none",
                  cursor: uploadingAvatar ? "wait" : "pointer", padding: 0,
                  opacity: uploadingAvatar ? 0.6 : 1,
                }}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    style={{ width: 80, height: 80, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid rgba(255,255,255,0.14)" }}
                  />
                ) : (
                  <div style={{
                    width: 80, height: 80, borderRadius: "50%",
                    background: getAvatarColor(avatarLabel),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 26, fontWeight: 700, color: "#fff", userSelect: "none",
                    border: "2px solid rgba(255,255,255,0.14)",
                  }}>
                    {getInitials(avatarLabel)}
                  </div>
                )}
                {/* Camera badge */}
                <div style={{
                  position: "absolute", bottom: 0, right: 0,
                  width: 26, height: 26, borderRadius: "50%",
                  background: "rgba(94,168,255,0.90)",
                  border: "2px solid #0d1320",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#fff",
                }}>
                  <CameraIcon />
                </div>
              </button>
              <span style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", fontWeight: 500 }}>
                {uploadingAvatar ? "Uploading…" : "Tap to change photo"}
              </span>
              {avatarError && <span style={{ fontSize: 12, color: "#f87171" }}>{avatarError}</span>}
            </div>

            {/* Fields */}
            <form onSubmit={handleSave} style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Display name */}
              <div style={{
                borderRadius: 14,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)",
                overflow: "hidden",
              }}>
                <div style={{ padding: "10px 14px 2px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.38)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Display name</span>
                </div>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                  style={{
                    display: "block", width: "100%", boxSizing: "border-box",
                    padding: "4px 14px 12px",
                    background: "none", border: "none", outline: "none",
                    fontSize: 16, fontWeight: 500, color: "#fff", fontFamily: "inherit",
                  }}
                />
              </div>

              {/* Username */}
              <div style={{
                borderRadius: 14,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)",
                overflow: "hidden",
              }}>
                <div style={{ padding: "10px 14px 2px" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.38)", letterSpacing: "0.07em", textTransform: "uppercase" }}>Username</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", padding: "4px 14px 12px", gap: 2 }}>
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.35)", userSelect: "none", lineHeight: 1 }}>@</span>
                  <input
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))
                    }
                    placeholder="yourname"
                    style={{
                      flex: 1, background: "none", border: "none", outline: "none",
                      fontSize: 16, fontWeight: 500, color: "#fff", fontFamily: "inherit",
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", paddingLeft: 2, marginTop: -4 }}>
                3–30 characters · letters, numbers, underscores
              </span>

              {saveError && (
                <p style={{ fontSize: 13, color: "#f87171", margin: 0 }}>{saveError}</p>
              )}

              {/* Save button */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  marginTop: 6,
                  padding: "14px",
                  borderRadius: 14,
                  background: saveSuccess
                    ? "rgba(74,222,128,0.15)"
                    : saving
                    ? "rgba(94,168,255,0.10)"
                    : "rgba(94,168,255,0.18)",
                  border: saveSuccess
                    ? "1px solid rgba(74,222,128,0.28)"
                    : "1px solid rgba(94,168,255,0.30)",
                  color: saveSuccess ? "#4ade80" : "#5EA8FF",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 700, fontSize: 15,
                  opacity: saving ? 0.6 : 1,
                  transition: "background 0.2s, color 0.2s, border 0.2s",
                } as React.CSSProperties}
              >
                {saving ? "Saving…" : saveSuccess ? "Saved ✓" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Settings drawer (slides in from right) ───────────────────────────── */}
      {settingsOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.50)",
            zIndex: 300,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            className="settings-drawer"
            style={{
              background: "var(--background)",
              borderRadius: "20px 0 0 20px",
              width: "min(320px, 100vw)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(20px, env(safe-area-inset-top)) 20px 16px" }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Settings</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
                style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-raised)", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6, color: "inherit" }}
              >
                ×
              </button>
            </div>

            {/* Menu items */}
            <div style={{ borderTop: "1px solid var(--border)", flex: 1 }}>

              {/* ── Identity switcher ───────────────────────────────────── */}
              <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--border)", overflowY: "auto" }}>
                <div
                  style={{
                    fontSize: 10, fontWeight: 700, opacity: 0.4,
                    letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10,
                  }}
                >
                  Account
                </div>

                {/* ── Personal identity ─────────────────────────────────── */}
                <button
                  type="button"
                  onClick={() => { setActiveOrganizer(null); setSettingsOpen(false); router.push("/profile"); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, width: "100%",
                    padding: "6px 0", background: "none", border: "none",
                    cursor: "pointer", color: "inherit", textAlign: "left",
                  }}
                >
                  {/* Avatar */}
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1.5px solid var(--border-medium)" }}
                    />
                  ) : (
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: getAvatarColor(avatarLabel),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none",
                    }}>
                      {getInitials(avatarLabel)}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {profile?.display_name ?? avatarLabel ?? "You"}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>Personal account</div>
                  </div>
                  {/* Active checkmark */}
                  {activeOrganizer === null && !identityLoading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5EA8FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* ── Organizer identities ──────────────────────────────── */}
                {identityLoading ? (
                  <div className="skeleton" style={{ height: 36, borderRadius: 9, background: "var(--surface-raised)", marginTop: 4 }} />
                ) : (
                  orgPages.map((org) => {
                    const isActive = activeOrganizer?.organizerId === org.organizerId;
                    const logoColors = ["#1e3a5f","#2d4a1e","#4a1e2d","#1e2d4a","#3a2d1e","#1e4a3a"];
                    let h = 0; for (let i = 0; i < org.name.length; i++) h = (h * 31 + org.name.charCodeAt(i)) & 0xffff;
                    const logoColor = logoColors[h % logoColors.length];
                    const initials2 = (() => { const p = org.name.trim().split(/\s+/); return p.length >= 2 ? (p[0][0]+p[1][0]).toUpperCase() : org.name.slice(0,2).toUpperCase(); })();
                    const typeLabels: Record<string,string> = { venue:"Venue",promoter:"Promoter",artist:"Artist",business:"Business",festival:"Festival",collective:"Collective",brand:"Brand",nonprofit:"Non-profit",school:"School",other:"Organizer" };

                    return (
                      <div key={org.organizerId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                        {/* Logo + name → navigate to org profile (no identity switch) */}
                        <Link
                          href={org.slug ? `/o/${org.slug}` : `/dashboard/organizers/${org.organizerId}/edit`}
                          onClick={() => setSettingsOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
                        >
                          {org.image_url ? (
                            <img src={org.image_url} alt={org.name} style={{ width: 36, height: 36, borderRadius: 9, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }} />
                          ) : (
                            <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: logoColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)", userSelect: "none" }}>
                              {initials2}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{org.name}</div>
                            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>{typeLabels[org.type] ?? org.type}</div>
                          </div>
                        </Link>
                        {/* Switch button — activates identity without navigating */}
                        {isActive ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5EA8FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Active" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setActiveOrganizer(org); setSettingsOpen(false); }}
                            style={{
                              flexShrink: 0, padding: "4px 10px", borderRadius: 14,
                              border: "1px solid rgba(94,168,255,0.30)",
                              background: "rgba(94,168,255,0.08)",
                              color: "#5EA8FF", fontSize: 11, fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Switch
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {/* ── Add organizer account ─────────────────────────────── */}
                {!identityLoading && (
                  <Link
                    href="/dashboard/organizers/new"
                    onClick={() => setSettingsOpen(false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "6px 0", marginTop: 2,
                      textDecoration: "none", color: "inherit",
                    }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                      background: "var(--surface-raised)",
                      border: "1px dashed var(--border-strong)",
                      display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.55,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, opacity: 0.55 }}>Add an organizer account</span>
                  </Link>
                )}
              </div>

              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "16px 20px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  fontSize: 15,
                  fontWeight: 500,
                  color: "#ef4444",
                  textAlign: "left",
                  gap: 12,
                  boxSizing: "border-box",
                }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

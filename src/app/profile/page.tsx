/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";

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

function ClockIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
      {/* Event section skeletons */}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "grid", gap: 12 }}>
          <div className="skeleton" style={{ width: 110, height: 18, borderRadius: 6, background: "var(--surface-raised)" }} />
          <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
            {[0, 1, 2].map((j) => (
              <div key={j} className="skeleton" style={{ width: 160, height: 148, borderRadius: 12, background: "var(--surface-raised)", flexShrink: 0 }} />
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}

// ── Event card ─────────────────────────────────────────────────────────────────

function EventCard({ e, showStatus }: { e: EventRow; showStatus?: boolean }) {
  return (
    <Link href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}>
      <div className="profile-event-card" style={{ width: 164 }}>
        {/* Image */}
        <div style={{ position: "relative", width: 164, height: 114, borderRadius: 12, overflow: "hidden", background: "var(--surface-raised)" }}>
          {e.image_url && (
            <img
              src={e.image_url}
              alt=""
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          )}
          {/* Pending badge — overlaid on image */}
          {showStatus && !e.is_approved && (
            <div
              style={{
                position: "absolute",
                top: 7,
                left: 7,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 20,
                background: "rgba(0,0,0,0.55)",
                color: "#fbbf24",
                backdropFilter: "blur(4px)",
                WebkitBackdropFilter: "blur(4px)",
              }}
            >
              <ClockIcon />
              Pending
            </div>
          )}
        </div>
        {/* Meta */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.5, letterSpacing: "0.01em" }}>{formatDate(e.start_at)}</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.3,
              marginTop: 3,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {e.title}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Event section ──────────────────────────────────────────────────────────────

function EventSection({
  title,
  events,
  emptyMsg,
  showStatus,
}: {
  title: string;
  events: EventRow[];
  emptyMsg: string;
  showStatus?: boolean;
}) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
        {events.length > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 20,
              background: "var(--accent-subtle)",
              color: "var(--accent)",
            }}
          >
            {events.length}
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.45, margin: 0 }}>{emptyMsg}</p>
      ) : (
        <div
          className="chip-row"
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 6,
          }}
        >
          {events.map((e) => (
            <EventCard key={e.id} e={e} showStatus={showStatus} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, loading: authLoading, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [goingEvents, setGoingEvents] = useState<EventRow[]>([]);
  const [interestedEvents, setInterestedEvents] = useState<EventRow[]>([]);
  const [fetching, setFetching] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session?.access_token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetching(true);
    fetch("/api/profile", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) {
          setProfile(json.profile);
          setEvents(json.events ?? []);
          setGoingEvents(json.going ?? []);
          setInterestedEvents(json.interested ?? []);
          setDisplayName(json.profile?.display_name ?? "");
          setUsername(json.profile?.username ?? "");
        }
      })
      .finally(() => setFetching(false));
  }, [authLoading, session?.access_token]);

  useEffect(() => {
    document.body.style.overflow = editOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [editOpen]);

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
        setEditOpen(false);
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
    } else {
      setAvatarError(json?.error ?? "Upload failed.");
    }
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
      className="page-main"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        display: "grid",
        gap: 36,
        background: "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)",
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
      />

      {/* ── Identity block ─────────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, paddingTop: 8 }}>

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

        <Link
          href="/friends/add"
          style={{ fontSize: 12, opacity: 0.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}
        >
          Find friends
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>

        {profile?.username && (
          <Link
            href={`/u/${profile.username}`}
            style={{ fontSize: 12, opacity: 0.5, textDecoration: "none", display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}
          >
            View public profile
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </section>

      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: 0 }} />

      {/* ── Event sections ───────────────────────────────────────────────────── */}
      <EventSection
        title="Going to"
        events={goingEvents}
        emptyMsg="You're not going to any upcoming events yet."
      />
      <EventSection
        title="Interested in"
        events={interestedEvents}
        emptyMsg="No saved events yet."
      />
      <EventSection
        title="Hosting"
        events={events}
        emptyMsg="You haven't created any events yet."
        showStatus
      />

      {/* ── Edit profile modal ───────────────────────────────────────────────── */}
      {editOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.50)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 18,
              width: "100%",
              maxWidth: 420,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.20)",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Edit profile</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--surface-raised)",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 18,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: 0.6,
                  color: "inherit",
                }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSave} style={{ padding: "20px", display: "grid", gap: 16 }}>
              {/* Avatar row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", display: "block", border: "2px solid var(--border-medium)" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "50%",
                        background: getAvatarColor(avatarLabel),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#fff",
                        userSelect: "none",
                        border: "2px solid var(--border-medium)",
                      }}
                    >
                      {getInitials(avatarLabel)}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    aria-label="Change photo"
                    style={{
                      position: "absolute",
                      bottom: 0,
                      right: 0,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      border: "2px solid var(--background)",
                      background: "var(--foreground)",
                      color: "var(--background)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: uploadingAvatar ? "wait" : "pointer",
                      opacity: uploadingAvatar ? 0.5 : 1,
                    }}
                  >
                    <CameraIcon />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: uploadingAvatar ? "wait" : "pointer",
                    opacity: uploadingAvatar ? 0.5 : 1,
                    color: "inherit",
                  }}
                >
                  {uploadingAvatar ? "Uploading…" : "Change photo"}
                </button>
              </div>

              {/* Display name */}
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.55 }}>Display name</span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                    fontSize: 14,
                    background: "transparent",
                    color: "inherit",
                    outline: "none",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </label>

              {/* Username */}
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.55 }}>Username</span>
                <div style={{ position: "relative" }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 12,
                      top: "50%",
                      transform: "translateY(-50%)",
                      opacity: 0.4,
                      fontSize: 14,
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  >
                    @
                  </span>
                  <input
                    value={username}
                    onChange={(e) =>
                      setUsername(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9_]/g, "")
                          .slice(0, 30)
                      )
                    }
                    placeholder="yourname"
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 12px 10px 26px",
                      borderRadius: 10,
                      border: "1px solid var(--border-strong)",
                      fontSize: 14,
                      background: "transparent",
                      color: "inherit",
                      outline: "none",
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, opacity: 0.4 }}>3–30 chars · letters, numbers, underscores</span>
              </label>

              {saveError && (
                <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{saveError}</p>
              )}

              {/* Save button */}
              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "12px",
                  borderRadius: 12,
                  border: "none",
                  background: saving
                    ? "var(--surface-raised)"
                    : saveSuccess
                    ? "rgba(16,185,129,0.15)"
                    : "var(--accent)",
                  color: saving ? "inherit" : saveSuccess ? "#10b981" : "#fff",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 14,
                  opacity: saving ? 0.6 : 1,
                  transition: "background 0.2s, color 0.2s",
                }}
              >
                {saving ? "Saving…" : saveSuccess ? "Saved!" : "Save changes"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

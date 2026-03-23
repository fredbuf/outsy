/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";

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

function CameraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function EventCard({ e, showStatus }: { e: EventRow; showStatus?: boolean }) {
  return (
    <Link href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}>
      <div style={{ width: 160 }}>
        {e.image_url ? (
          <img
            src={e.image_url}
            alt=""
            style={{ width: 160, height: 108, objectFit: "cover", borderRadius: 10, display: "block" }}
          />
        ) : (
          <div style={{ width: 160, height: 108, borderRadius: 10, background: "var(--surface-raised)" }} />
        )}
        <div style={{ marginTop: 7 }}>
          <div style={{ fontSize: 11, opacity: 0.55 }}>{formatDate(e.start_at)}</div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.25,
              marginTop: 2,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {e.title}
          </div>
          {showStatus && !e.is_approved && (
            <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>Pending review</div>
          )}
        </div>
      </div>
    </Link>
  );
}

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
    <section style={{ display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
      {events.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.5, margin: 0 }}>{emptyMsg}</p>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            paddingBottom: 4,
            scrollbarWidth: "none",
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

  if (authLoading || fetching) {
    return (
      <main style={{ padding: "40px 16px", textAlign: "center", opacity: 0.5, fontSize: 14 }}>
        Loading…
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "48px 16px",
          display: "grid",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Your profile</h1>
        <p style={{ opacity: 0.65 }}>Sign in to view and edit your profile.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            alignSelf: "start",
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)",
            cursor: "pointer",
            fontWeight: 600,
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
        padding: "24px 16px 56px",
        display: "grid",
        gap: 32,
        background: "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)",
      }}
    >
      {/* Hidden file input — triggered by camera button or "Change photo" */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
      />

      {/* ── Identity block ───────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, paddingTop: 8 }}>

        {/* Avatar with camera overlay */}
        <div style={{ position: "relative", width: 88, height: 88 }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={avatarLabel ?? ""}
              style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div
              style={{
                width: 88,
                height: 88,
                borderRadius: "50%",
                background: getAvatarColor(avatarLabel),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 30,
                fontWeight: 700,
                color: "#fff",
                userSelect: "none",
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
              bottom: 2,
              right: 2,
              width: 26,
              height: 26,
              borderRadius: "50%",
              border: "2px solid var(--background)",
              background: "var(--btn-bg-active)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: uploadingAvatar ? "wait" : "pointer",
              opacity: uploadingAvatar ? 0.5 : 1,
              color: "inherit",
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
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>
            {profile?.display_name ?? avatarLabel ?? "Anonymous"}
          </div>
          {profile?.username && (
            <div style={{ fontSize: 14, opacity: 0.45, marginTop: 3 }}>
              @{profile.username}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            style={{
              padding: "9px 22px",
              borderRadius: 20,
              border: "1px solid var(--border-strong)",
              background: "var(--btn-bg)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              color: "inherit",
            }}
          >
            Edit profile
          </button>
          <button
            type="button"
            onClick={handleShare}
            style={{
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
            {shareMsg ?? "Share profile"}
          </button>
        </div>

        {profile?.username && (
          <Link
            href={`/u/${profile.username}`}
            style={{ fontSize: 12, opacity: 0.35, textDecoration: "underline" }}
          >
            View public profile →
          </Link>
        )}
      </section>

      {/* ── Event sections ───────────────────────────────────────────────── */}
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

      {/* ── Edit profile modal ───────────────────────────────────────────── */}
      {editOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
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
              borderRadius: 16,
              width: "100%",
              maxWidth: 420,
              overflow: "hidden",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Edit profile</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  opacity: 0.35,
                  color: "inherit",
                }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSave} style={{ padding: "18px 18px 20px", display: "grid", gap: 14 }}>
              {/* Avatar row */}
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ position: "relative", width: 56, height: 56, flexShrink: 0 }}>
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", display: "block" }}
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
                      background: "var(--btn-bg-active)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: uploadingAvatar ? "wait" : "pointer",
                      opacity: uploadingAvatar ? 0.5 : 1,
                      color: "inherit",
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
                    padding: "7px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    fontSize: 13,
                    cursor: uploadingAvatar ? "wait" : "pointer",
                    opacity: uploadingAvatar ? 0.5 : 1,
                    color: "inherit",
                  }}
                >
                  {uploadingAvatar ? "Uploading…" : "Change photo"}
                </button>
              </div>

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.6 }}>Display name</span>
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

              <label style={{ display: "grid", gap: 4 }}>
                <span style={{ fontSize: 12, opacity: 0.6 }}>Username</span>
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
                      paddingTop: 10,
                      paddingBottom: 10,
                      paddingLeft: 26,
                      paddingRight: 12,
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

              <button
                type="submit"
                disabled={saving}
                style={{
                  padding: "11px",
                  borderRadius: 10,
                  border: "none",
                  background: saving || saveSuccess ? "var(--surface-raised)" : "var(--btn-bg-active)",
                  cursor: saving ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  fontSize: 14,
                  color: "inherit",
                  opacity: saving ? 0.6 : 1,
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

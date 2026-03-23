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

function EventTile({ e }: { e: EventRow }) {
  return (
    <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
      <article
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        {e.image_url ? (
          <img
            src={e.image_url}
            alt=""
            style={{
              width: 56,
              height: 56,
              objectFit: "cover",
              borderRadius: 8,
              flex: "0 0 auto",
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              background: "var(--surface-subtle)",
              flex: "0 0 auto",
            }}
          />
        )}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(e.start_at)}</div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1.2,
              marginTop: 2,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {e.title}
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.5,
              marginTop: 3,
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span style={{ textTransform: "capitalize" }}>{e.category_primary}</span>
            <span>·</span>
            <span style={{ textTransform: "capitalize" }}>{e.visibility}</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [goingEvents, setGoingEvents] = useState<EventRow[]>([]);
  const [interestedEvents, setInterestedEvents] = useState<EventRow[]>([]);
  const [fetching, setFetching] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

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
      setTimeout(() => setSaveSuccess(false), 3000);
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
        padding: "24px 16px 48px",
        display: "grid",
        gap: 28,
        background: "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)",
      }}
    >
      <Link href="/events" style={{ opacity: 0.6, fontSize: 14, textDecoration: "none" }}>
        ← Back to events
      </Link>

      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Your profile</h1>

      <section style={{ display: "grid", gap: 16 }}>
        {/* Avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={avatarLabel ?? ""}
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                objectFit: "cover",
                flex: "0 0 auto",
              }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: getAvatarColor(avatarLabel),
                flex: "0 0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 700,
                color: "#fff",
                userSelect: "none",
              }}
            >
              {getInitials(avatarLabel)}
            </div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={(e) => handleAvatarChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                cursor: uploadingAvatar ? "wait" : "pointer",
                fontSize: 13,
                opacity: uploadingAvatar ? 0.5 : 1,
              }}
            >
              {uploadingAvatar ? "Uploading…" : "Change photo"}
            </button>
            {avatarError && (
              <p style={{ fontSize: 12, color: "#dc2626", margin: 0 }}>{avatarError}</p>
            )}
          </div>
        </div>

        {/* Profile form */}
        <form onSubmit={handleSave} style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border-strong)",
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              Username{" "}
              <span style={{ opacity: 0.5 }}>
                (letters, numbers, underscores · 3–30 chars)
              </span>
            </span>
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
                }}
              />
            </div>
            {profile?.username && (
              <span style={{ fontSize: 12, opacity: 0.45 }}>
                Your public profile:{" "}
                <Link
                  href={`/u/${profile.username}`}
                  style={{ textDecoration: "underline", opacity: 0.8 }}
                >
                  /u/{profile.username}
                </Link>
              </span>
            )}
          </label>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "1px solid var(--border-strong)",
                background: saving ? "var(--surface-subtle)" : "var(--btn-bg)",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {saving ? "Saving…" : saveSuccess ? "Saved!" : "Save changes"}
            </button>
            {saveError && (
              <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{saveError}</p>
            )}
          </div>
        </form>
      </section>

      {/* Going */}
      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Going</h2>
        {goingEvents.length === 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ fontSize: 14, opacity: 0.55, margin: 0 }}>
              You&apos;re not going to any upcoming events yet.
            </p>
            <Link
              href="/events"
              style={{
                alignSelf: "start",
                fontSize: 14,
                fontWeight: 600,
                opacity: 0.7,
                textDecoration: "underline",
              }}
            >
              Browse events →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {goingEvents.map((e) => (
              <EventTile key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>

      {/* Interested */}
      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Interested</h2>
        {interestedEvents.length === 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ fontSize: 14, opacity: 0.55, margin: 0 }}>No saved events yet.</p>
            <Link
              href="/events"
              style={{
                alignSelf: "start",
                fontSize: 14,
                fontWeight: 600,
                opacity: 0.7,
                textDecoration: "underline",
              }}
            >
              Browse events →
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {interestedEvents.map((e) => (
              <EventTile key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>

      {/* User's own events */}
      {events.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Your events</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {events.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <article
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  {e.image_url ? (
                    <img
                      src={e.image_url}
                      alt=""
                      style={{
                        width: 56,
                        height: 56,
                        objectFit: "cover",
                        borderRadius: 8,
                        flex: "0 0 auto",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: "var(--surface-subtle)",
                        flex: "0 0 auto",
                      }}
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>{formatDate(e.start_at)}</div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        marginTop: 2,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {e.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.5,
                        marginTop: 3,
                        display: "flex",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ textTransform: "capitalize" }}>{e.category_primary}</span>
                      <span>·</span>
                      <span style={{ textTransform: "capitalize" }}>{e.visibility}</span>
                      {!e.is_approved && (
                        <>
                          <span>·</span>
                          <span>Pending review</span>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import type { FriendProfile } from "@/app/api/friends/route";

// ── Avatar helpers ──────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// ── Category gradient fallback ───────────────────────────────────────────────

function categoryGradient(cat: string): string {
  switch (cat) {
    case "concerts": case "music":
      return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":
      return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": case "art":
      return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":
      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":
      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":
      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:
      return "linear-gradient(150deg, #0d0d1a 0%, #1a1a2e 100%)";
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

type Sheet = null | "options" | "picker";

export type EventPreview = {
  imageUrl: string | null;
  category: string;
  hostName: string | null;
  dateStr: string | null;
  venueName: string | null;
};

// ── Preview card ─────────────────────────────────────────────────────────────

function EventPreviewCard({ preview, title }: { preview: EventPreview; title: string }) {
  const { imageUrl, category, hostName, dateStr, venueName } = preview;
  const hasCover = Boolean(imageUrl);

  return (
    <div style={{ padding: "10px 16px 4px" }}>
      {/* Sender line */}
      {hostName && (
        <div style={{
          fontSize: 12, opacity: 0.45, marginBottom: 7,
          paddingLeft: 2, letterSpacing: "0.01em",
        }}>
          {hostName} is hosting
        </div>
      )}

      {/* Card */}
      <div
        style={{
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.12)",
          position: "relative",
          boxShadow: "0 6px 28px rgba(0,0,0,0.50)",
        }}
      >
        {/* Cover image or gradient */}
        {hasCover ? (
          <img
            src={imageUrl!}
            alt=""
            style={{
              width: "100%", height: 156,
              objectFit: "cover", display: "block",
            }}
          />
        ) : (
          <div style={{
            width: "100%", height: 120,
            background: categoryGradient(category),
          }} />
        )}

        {/* Gradient overlay + text */}
        <div
          style={{
            position: "absolute",
            bottom: 0, left: 0, right: 0,
            padding: hasCover ? "48px 14px 12px" : "20px 14px 12px",
            background: hasCover
              ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.0) 100%)"
              : "none",
          }}
        >
          <div style={{
            fontSize: 15, fontWeight: 700, color: "#fff",
            lineHeight: 1.25,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}>
            {title}
          </div>

          {(dateStr || venueName) && (
            <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
              {dateStr && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ opacity: 0.7 }}>🕒</span>
                  <span>{dateStr}</span>
                </div>
              )}
              {venueName && (
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.48)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ opacity: 0.7 }}>📍</span>
                  <span
                    style={{
                      overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                    }}
                  >
                    {venueName}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* "View event" pill — top right */}
        <div style={{
          position: "absolute", top: 9, right: 9,
          background: "rgba(0,0,0,0.50)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderRadius: 20,
          padding: "4px 9px 4px 8px",
          display: "flex", alignItems: "center", gap: 3,
          border: "1px solid rgba(255,255,255,0.10)",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: 600, letterSpacing: "0.01em" }}>
            View event
          </span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export function ShareButton({
  title,
  eventId,
  large,
  preview,
}: {
  title: string;
  eventId?: string;
  large?: boolean;
  preview?: EventPreview;
}) {
  const { user, session } = useAuth();

  // Sheet state
  const [sheet, setSheet] = useState<Sheet>(null);

  // Friends picker state
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);

  // Optional message to attach to the event share
  const [message, setMessage] = useState("");

  // Copy-link feedback
  const [copied, setCopied] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openSheet() {
    if (eventId) {
      setSheet("options");
    } else {
      handleExternalShare();
    }
  }

  async function handleExternalShare() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title, url }); return; } catch { /* cancelled */ }
    }
    await copyToClipboard(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleCopyLink() {
    const url = window.location.href;
    await copyToClipboard(url);
    setCopied(true);
    setSheet(null);
    setTimeout(() => setCopied(false), 2000);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
  }

  async function openPicker() {
    if (!session) {
      window.dispatchEvent(new Event("outsy:open-signin"));
      setSheet(null);
      return;
    }
    setSendError(null);
    setSheet("picker");
    if (friends !== null) return;
    setLoadingFriends(true);
    try {
      const res = await fetch("/api/friends", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = (await res.json()) as { ok: boolean; friends?: FriendProfile[] };
      if (data.ok) setFriends(data.friends ?? []);
    } finally {
      setLoadingFriends(false);
    }
  }

  async function sendToFriend(friend: FriendProfile) {
    if (!session || !eventId || sendingTo) return;
    setSendingTo(friend.id);
    setSendError(null);
    try {
      // 1. Send the event card
      const res = await fetch(`/api/social/messages/${friend.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };

      if (!data.ok) {
        setSendError(data.error ?? "Failed to send.");
        setSendingTo(null);
        return;
      }

      // 2. If user added a message, send it as a follow-up text
      const trimmed = message.trim();
      if (trimmed) {
        await fetch(`/api/social/messages/${friend.id}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ body: trimmed }),
        });
      }

      // Mark as sent — stay on the page
      setSentTo((prev) => new Set(prev).add(friend.id));
      setSendingTo(null);
    } catch {
      setSendError("Network error.");
      setSendingTo(null);
    }
  }

  // ── Shared sheet wrapper ──────────────────────────────────────────────────

  const sheetStyle: React.CSSProperties = {
    background: "#111110",
    color: "#eae8e4",
    borderRadius: "20px 20px 0 0",
    width: "100%",
    maxWidth: 540,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    "--border": "rgba(255,255,255,0.10)",
    "--border-strong": "rgba(255,255,255,0.18)",
    "--surface-raised": "rgba(255,255,255,0.09)",
    "--accent": "#a78bfa",
  } as React.CSSProperties;

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 300,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  };

  const sheetHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px 12px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  };

  const closeBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer",
    fontSize: 20, opacity: 0.5, lineHeight: 1, color: "inherit",
    width: 28, flexShrink: 0,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={openSheet}
        title={copied ? "Copied!" : "Share event"}
        aria-label="Share event"
        style={large ? {
          flex: 1,
          padding: "18px 12px",
          borderRadius: 16,
          background: copied ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
          color: "inherit",
          fontSize: 14,
          fontWeight: 600,
          transition: "background 0.15s",
        } : {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 40, height: 40, borderRadius: 12,
          border: "1px solid var(--border-strong)",
          background: copied ? "var(--btn-bg)" : "transparent",
          cursor: "pointer", color: "inherit", flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        {copied ? (
          <svg width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width={large ? 20 : 16} height={large ? 20 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        )}
        {large && <span>{copied ? "Copied!" : "Share"}</span>}
      </button>

      {/* Options sheet */}
      {sheet === "options" && createPortal(
        <div
          style={overlayStyle}
          onClick={(e) => e.target === e.currentTarget && setSheet(null)}
        >
          <div style={sheetStyle}>
            <div style={sheetHeaderStyle}>
              <div style={{ width: 28, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Share</span>
              <button type="button" onClick={() => setSheet(null)} style={closeBtn}>×</button>
            </div>

            {/* Event preview card */}
            {preview && <EventPreviewCard preview={preview} title={title} />}

            <div style={{ paddingBlock: 6, paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>

              {/* Send to friend */}
              {(user || !session) && (
                <button
                  type="button"
                  onClick={openPicker}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    width: "100%", padding: "14px 20px",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", color: "inherit",
                  }}
                >
                  <span style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: "var(--surface-raised)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Send to friend</span>
                </button>
              )}

              {/* Copy link */}
              <button
                type="button"
                onClick={handleCopyLink}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  width: "100%", padding: "14px 20px",
                  background: "transparent", border: "none",
                  cursor: "pointer", textAlign: "left", color: "inherit",
                }}
              >
                <span style={{
                  width: 38, height: 38, borderRadius: "50%",
                  background: "var(--surface-raised)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <span style={{ fontSize: 15, fontWeight: 600 }}>Copy link</span>
              </button>

              {/* Native share — only on mobile/browsers that support it */}
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <button
                  type="button"
                  onClick={async () => {
                    setSheet(null);
                    await handleExternalShare();
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    width: "100%", padding: "14px 20px",
                    background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", color: "inherit",
                  }}
                >
                  <span style={{
                    width: 38, height: 38, borderRadius: "50%",
                    background: "var(--surface-raised)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>Share…</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Friend picker sheet */}
      {sheet === "picker" && createPortal(
        <div
          style={overlayStyle}
          onClick={(e) => e.target === e.currentTarget && setSheet(null)}
        >
          <div style={{ ...sheetStyle, maxHeight: "82dvh" }}>
            <div style={sheetHeaderStyle}>
              <div style={{ width: 28, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Send to friend</span>
              <button type="button" onClick={() => setSheet(null)} style={closeBtn}>×</button>
            </div>

            {/* Optional message input */}
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a message… (optional)"
                maxLength={200}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.07)",
                  color: "inherit",
                  fontSize: 14,
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ flex: 1, overflowY: "auto", marginTop: 8 }}>
              {sendError && (
                <div style={{ padding: "8px 20px", fontSize: 13, color: "#dc2626" }}>{sendError}</div>
              )}

              {loadingFriends ? (
                <div style={{ padding: "40px 20px", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>
              ) : !friends || friends.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", opacity: 0.4, fontSize: 14, lineHeight: 1.6 }}>
                  No friends yet.<br />Add friends from their profile.
                </div>
              ) : (
                <div style={{ paddingBlock: 6, paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
                  {friends.map((friend) => {
                    const name = friend.display_name ?? friend.username ?? "User";
                    const isSending = sendingTo === friend.id;
                    const isDone = sentTo.has(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => !isDone && sendToFriend(friend)}
                        disabled={!!sendingTo || isDone}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          width: "100%", padding: "11px 20px",
                          background: "transparent", border: "none",
                          cursor: isDone ? "default" : sendingTo ? "not-allowed" : "pointer",
                          textAlign: "left",
                          opacity: sendingTo && !isSending ? 0.4 : 1,
                          transition: "opacity 0.12s",
                        }}
                      >
                        {friend.avatar_url ? (
                          <img
                            src={friend.avatar_url}
                            alt={name}
                            style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: avatarColor(name), flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 700, color: "#fff", userSelect: "none",
                          }}>
                            {initials(name)}
                          </div>
                        )}
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</span>
                        {isDone ? (
                          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: "#4ade80", display: "flex", alignItems: "center", gap: 4 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Sent
                          </span>
                        ) : (
                          <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: isSending ? "inherit" : "var(--accent)", opacity: isSending ? 0.5 : 1 }}>
                            {isSending ? "Sending…" : "Send"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

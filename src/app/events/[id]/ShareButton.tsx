/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

// ── Types ────────────────────────────────────────────────────────────────────

type Sheet = null | "options" | "picker";

// ── Component ────────────────────────────────────────────────────────────────

export function ShareButton({
  title,
  eventId,
}: {
  title: string;
  eventId?: string;
}) {
  const router = useRouter();
  const { user, session } = useAuth();

  // Sheet state
  const [sheet, setSheet] = useState<Sheet>(null);

  // Friends picker state
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

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
      const res = await fetch(`/api/social/messages/${friend.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setSheet(null);
        router.push(`/social/messages/${friend.id}`);
      } else {
        setSendError(data.error ?? "Failed to send.");
        setSendingTo(null);
      }
    } catch {
      setSendError("Network error.");
      setSendingTo(null);
    }
  }

  // ── Shared sheet wrapper ──────────────────────────────────────────────────

  const sheetStyle: React.CSSProperties = {
    background: "var(--background)",
    borderRadius: "20px 20px 0 0",
    width: "100%",
    maxWidth: 540,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 300,
    background: "rgba(0,0,0,0.55)",
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
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 40, height: 40, borderRadius: 12,
          border: "1px solid var(--border-strong)",
          background: copied ? "var(--btn-bg)" : "transparent",
          cursor: "pointer", color: "inherit", flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
        )}
      </button>

      {/* Options sheet */}
      {sheet === "options" && (
        <div
          style={overlayStyle}
          onClick={(e) => e.target === e.currentTarget && setSheet(null)}
        >
          <div style={sheetStyle}>
            <div style={sheetHeaderStyle}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Share</span>
              <button type="button" onClick={() => setSheet(null)} style={closeBtn}>×</button>
            </div>
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
        </div>
      )}

      {/* Friend picker sheet */}
      {sheet === "picker" && (
        <div
          style={overlayStyle}
          onClick={(e) => e.target === e.currentTarget && setSheet(null)}
        >
          <div style={{ ...sheetStyle, maxHeight: "72dvh" }}>
            <div style={sheetHeaderStyle}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Send to friend</span>
              <button type="button" onClick={() => setSheet(null)} style={closeBtn}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
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
                    const isDone = false; // navigates away on success
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => sendToFriend(friend)}
                        disabled={!!sendingTo || isDone}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          width: "100%", padding: "11px 20px",
                          background: "transparent", border: "none",
                          cursor: sendingTo ? "not-allowed" : "pointer",
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
                        <span style={{ fontSize: 13, fontWeight: 600, flexShrink: 0, color: isSending ? "inherit" : "var(--accent)", opacity: isSending ? 0.5 : 1 }}>
                          {isSending ? "Sending…" : "Send"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

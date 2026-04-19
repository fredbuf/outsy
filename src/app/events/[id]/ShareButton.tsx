/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import type { FriendProfile } from "@/app/api/friends/route";
import { ShareIcon } from "./CustomIcons";

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
    <div style={{ padding: "12px 16px 8px" }}>
      {hostName && (
        <div style={{
          fontSize: 11, opacity: 0.32, marginBottom: 6,
          paddingLeft: 2, letterSpacing: "0.01em",
        }}>
          {hostName} is hosting
        </div>
      )}
      <div style={{
        borderRadius: 14, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.12)",
        position: "relative",
        boxShadow: "0 6px 28px rgba(0,0,0,0.50)",
      }}>
        {hasCover ? (
          <img
            src={imageUrl!}
            alt=""
            style={{ width: "100%", height: 148, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: 112, background: categoryGradient(category) }} />
        )}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: hasCover ? "44px 14px 12px" : "18px 14px 12px",
          background: hasCover
            ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.0) 100%)"
            : "none",
        }}>
          <div style={{
            fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            {title}
          </div>
          {(dateStr || venueName) && (
            <div style={{
              marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.55)",
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>
              {[dateStr, venueName].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{
          position: "absolute", top: 9, right: 9,
          background: "rgba(0,0,0,0.50)", backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)", borderRadius: 20,
          padding: "4px 9px 4px 8px",
          display: "flex", alignItems: "center", gap: 3,
          border: "1px solid rgba(255,255,255,0.10)",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", fontWeight: 600 }}>View event</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({
  icon, label, onClick, accent,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 14,
        width: "100%", padding: "11px 16px",
        background: "none", border: "1px solid transparent",
        borderRadius: 14, cursor: "pointer",
        color: accent ? "#5EA8FF" : "inherit",
        textAlign: "left", fontFamily: "inherit",
        marginBottom: 4, boxSizing: "border-box",
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
        background: accent ? "rgba(94,168,255,0.12)" : "rgba(255,255,255,0.09)",
        border: accent ? "1px solid rgba(94,168,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: accent ? "#5EA8FF" : "rgba(255,255,255,0.80)",
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
    </button>
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

  const [sheet, setSheet] = useState<Sheet>(null);
  const [closing, setClosing] = useState(false);

  // Friends picker state
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [sendError, setSendError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Copy-link feedback
  const [copied, setCopied] = useState(false);

  // ── Animation helpers ─────────────────────────────────────────────────────

  function closeAll() {
    setClosing(true);
    setTimeout(() => { setSheet(null); setClosing(false); }, 250);
  }

  function goToOptions() {
    setSheet("options");
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  function openSheet() {
    if (eventId) {
      setSheet("options");
      setClosing(false);
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
    closeAll();
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
    setClosing(false);
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
      if (!data.ok) {
        setSendError(data.error ?? "Failed to send.");
        setSendingTo(null);
        return;
      }
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
      setSentTo((prev) => new Set(prev).add(friend.id));
      setSendingTo(null);
    } catch {
      setSendError("Network error.");
      setSendingTo(null);
    }
  }

  // ── Sheet shell ──────────────────────────────────────────────────────────

  const sheetShell = (
    children: React.ReactNode,
    headerTitle: string,
    onClose: () => void,
    maxH = "82vh",
  ) => (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
        style={{
          width: "100%",
          background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
          borderRadius: "22px 22px 0 0",
          maxHeight: maxH,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
        </div>

        {/* Header — 3-column grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center", padding: "10px 16px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
        }}>
          <button
            type="button"
            onClick={onClose}
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
          <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>
            {headerTitle}
          </div>
          {/* Right slot — empty placeholder to keep title centred */}
          <div />
        </div>

        {children}
      </div>
    </div>
  );

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
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 9, color: "inherit", fontSize: 14, fontWeight: 600,
          transition: "background 0.15s",
        } : {
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 34, height: 34, borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.12)",
          background: copied ? "rgba(18,25,36,0.40)" : "rgba(18,25,36,0.20)",
          cursor: "pointer", color: "inherit", flexShrink: 0,
          transition: "background 0.15s",
        }}
      >
        {copied ? (
          <svg width={large ? 20 : 18} height={large ? 20 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <ShareIcon size={large ? 20 : 18} />
        )}
        {large && <span>{copied ? "Copied!" : "Share"}</span>}
      </button>

      {/* Options sheet */}
      {sheet === "options" && createPortal(
        sheetShell(
          <>
            {/* Event preview card */}
            {preview && <EventPreviewCard preview={preview} title={title} />}

            {/* Action rows */}
            <div style={{
              padding: "6px 8px",
              paddingBottom: "max(20px, env(safe-area-inset-bottom))",
              overflowY: "auto",
            }}>
              {/* Send to friend */}
              {(user || !session) && (
                <ActionRow
                  onClick={openPicker}
                  label="Send to friend"
                  icon={
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                  }
                />
              )}

              {/* Copy link */}
              <ActionRow
                onClick={handleCopyLink}
                label="Copy link"
                accent={copied}
                icon={copied ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              />

              {/* Native share — only when browser supports it */}
              {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                <ActionRow
                  onClick={async () => {
                    closeAll();
                    await handleExternalShare();
                  }}
                  label="Share…"
                  icon={
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  }
                />
              )}
            </div>
          </>,
          "Share",
          closeAll,
          "82vh",
        ),
        document.body
      )}

      {/* Friend picker sheet */}
      {sheet === "picker" && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeAll(); }}
        >
          <div
            className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              maxHeight: "82vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — back (←) left, title centre, empty right */}
            <div style={{
              display: "grid", gridTemplateColumns: "44px 1fr 44px",
              alignItems: "center", padding: "10px 16px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={goToOptions}
                aria-label="Back"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)",
                  cursor: "pointer", color: "rgba(255,255,255,0.78)",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>
                Send to friend
              </div>
              <div />
            </div>

            {/* Message input */}
            <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "0 14px", height: 50, borderRadius: 14,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a message… (optional)"
                  maxLength={200}
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    fontSize: 15, color: "#fff", fontFamily: "inherit",
                  }}
                />
                {message && (
                  <button
                    type="button"
                    onClick={() => setMessage("")}
                    aria-label="Clear message"
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: "50%",
                      background: "rgba(255,255,255,0.14)", border: "none",
                      cursor: "pointer", flexShrink: 0, color: "inherit",
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* Friend list — scrollable */}
            <div style={{
              overflowY: "auto", flex: 1, minHeight: 0,
              padding: "8px 8px 0",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}>
              {sendError && (
                <div style={{ padding: "8px 12px 4px", fontSize: 13, color: "#dc2626" }}>
                  {sendError}
                </div>
              )}

              {loadingFriends ? (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "32px 20px 0", margin: 0 }}>
                  Loading…
                </p>
              ) : !friends || friends.length === 0 ? (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "32px 20px 0", margin: 0, lineHeight: 1.6 }}>
                  No friends yet.<br />Add friends from their profile.
                </p>
              ) : (
                friends.map((friend) => {
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
                        display: "flex", alignItems: "center", gap: 14,
                        width: "100%", padding: "10px 12px",
                        background: isDone ? "rgba(74,222,128,0.06)" : "none",
                        border: isDone ? "1px solid rgba(74,222,128,0.18)" : "1px solid transparent",
                        borderRadius: 14, cursor: isDone ? "default" : sendingTo ? "not-allowed" : "pointer",
                        color: "inherit", textAlign: "left", fontFamily: "inherit",
                        marginBottom: 4, boxSizing: "border-box",
                        opacity: sendingTo && !isSending ? 0.4 : 1,
                        transition: "opacity 0.12s",
                      }}
                    >
                      {/* Avatar */}
                      {friend.avatar_url ? (
                        <img
                          src={friend.avatar_url}
                          alt=""
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

                      {/* Name + username */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: isDone ? "#4ade80" : "#fff",
                        }}>
                          {friend.display_name ?? `@${friend.username}`}
                        </div>
                        {friend.username && (
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>
                            @{friend.username}
                          </div>
                        )}
                      </div>

                      {/* Send / Sent indicator */}
                      {isDone ? (
                        <div style={{
                          display: "flex", alignItems: "center", gap: 5,
                          fontSize: 13, fontWeight: 600, flexShrink: 0, color: "#4ade80",
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Sent
                        </div>
                      ) : (
                        <div style={{
                          fontSize: 13, fontWeight: 600, flexShrink: 0,
                          color: isSending ? "rgba(255,255,255,0.38)" : "#5EA8FF",
                          opacity: isSending ? 0.6 : 1,
                        }}>
                          {isSending ? "Sending…" : "Send"}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

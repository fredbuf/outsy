/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/app/components/AuthProvider";
import type { FriendProfile } from "@/app/api/friends/route";

// ── Avatar helpers ─────────────────────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export function InviteFriendsButton({ eventId, large }: { eventId: string; large?: boolean }) {
  const { user, session } = useAuth();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  function closeSheet() {
    setClosing(true);
    setTimeout(() => { setOpen(false); setClosing(false); }, 250);
  }

  async function openModal() {
    if (!session) {
      window.dispatchEvent(new Event("outsy:open-signin"));
      return;
    }
    setDoneCount(null);
    setSelected(new Set());
    setSearch("");
    setOpen(true);
    // Cache friends list for the lifetime of this component
    if (friends !== null) return;
    setLoading(true);
    try {
      const res = await fetch("/api/friends", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = (await res.json()) as { ok: boolean; friends?: FriendProfile[] };
      if (data.ok) setFriends(data.friends ?? []);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function sendInvites() {
    if (!session || selected.size === 0) return;
    setSending(true);
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((userId) =>
        fetch(`/api/events/${eventId}/invite`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId }),
        }).then((r) => r.json() as Promise<{ ok: boolean }>)
      )
    );
    const count = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok
    ).length;
    setSending(false);
    setDoneCount(count);
    setSelected(new Set());
    setTimeout(() => closeSheet(), 1800);
  }

  // Hide for logged-out users — they see the Sign in prompt from the page itself
  if (!user) return null;

  // Filtered friend list
  const q = search.toLowerCase();
  const filteredFriends = (friends ?? []).filter((f) => {
    if (!q) return true;
    return (
      (f.display_name ?? "").toLowerCase().includes(q) ||
      (f.username ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={openModal}
        style={large ? {
          flex: 1,
          padding: "18px 12px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.06)",
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
        } : {
          alignSelf: "start",
          padding: "10px 16px",
          borderRadius: 12,
          border: "1px solid var(--border-strong)",
          background: "transparent",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 7,
          color: "inherit",
          flexShrink: 0,
        }}
      >
        {/* person+ icon */}
        <svg width={large ? 20 : 15} height={large ? 20 : 15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="22" y1="11" x2="16" y2="11" />
        </svg>
        Invite
      </button>

      {/* Friend picker bottom sheet */}
      {(open || closing) && createPortal(
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}
        >
          <div
            className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              maxHeight: "92vh",
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
              {/* Close button */}
              <button
                type="button"
                onClick={closeSheet}
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

              {/* Title */}
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>
                {doneCount !== null
                  ? `Invited ${doneCount} ${doneCount === 1 ? "friend" : "friends"} ✓`
                  : selected.size > 0
                  ? `Invite · ${selected.size}`
                  : "Invite friends"}
              </div>

              {/* Confirm button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={sendInvites}
                  aria-label="Send invites"
                  disabled={selected.size === 0 || sending || doneCount !== null}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 34, height: 34, borderRadius: "50%",
                    background: selected.size === 0 || sending || doneCount !== null
                      ? "rgba(255,255,255,0.07)"
                      : "rgba(94,168,255,0.14)",
                    border: selected.size === 0 || sending || doneCount !== null
                      ? "1px solid rgba(255,255,255,0.12)"
                      : "1px solid rgba(94,168,255,0.28)",
                    cursor: selected.size === 0 || sending || doneCount !== null ? "not-allowed" : "pointer",
                    color: selected.size === 0 || sending || doneCount !== null
                      ? "rgba(255,255,255,0.28)"
                      : "#5EA8FF",
                    opacity: sending ? 0.5 : 1,
                    transition: "background 0.15s, border 0.15s, color 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Search — pinned */}
            <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "0 14px", height: 50, borderRadius: 14,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)",
              }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends…"
                  style={{
                    flex: 1, background: "none", border: "none", outline: "none",
                    fontSize: 16, color: "#fff", fontFamily: "inherit",
                  }}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
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
              {doneCount !== null ? (
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.45)",
                  textAlign: "center", padding: "40px 20px 0", margin: 0,
                }}>
                  Invites sent!
                </p>
              ) : loading ? (
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.32)",
                  textAlign: "center", padding: "32px 20px 0", margin: 0,
                }}>
                  Loading…
                </p>
              ) : !friends || friends.length === 0 ? (
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.32)",
                  textAlign: "center", padding: "32px 20px 0", margin: 0, lineHeight: 1.6,
                }}>
                  No friends to invite yet.<br />Add friends from their profile.
                </p>
              ) : filteredFriends.length === 0 ? (
                <p style={{
                  fontSize: 13, color: "rgba(255,255,255,0.32)",
                  textAlign: "center", padding: "28px 20px 0", margin: 0,
                }}>
                  No results.
                </p>
              ) : (
                filteredFriends.map((friend) => {
                  const name = friend.display_name ?? friend.username ?? "User";
                  const isSelected = selected.has(friend.id);
                  return (
                    <button
                      key={friend.id}
                      type="button"
                      onClick={() => toggle(friend.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        width: "100%", padding: "10px 12px",
                        background: isSelected ? "rgba(94,168,255,0.08)" : "none",
                        border: isSelected ? "1px solid rgba(94,168,255,0.22)" : "1px solid transparent",
                        borderRadius: 14, cursor: "pointer",
                        color: "inherit", textAlign: "left", fontFamily: "inherit",
                        marginBottom: 4, boxSizing: "border-box",
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
                        <div
                          style={{
                            width: 40, height: 40, borderRadius: "50%",
                            background: avatarColor(name), flexShrink: 0,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 700, color: "#fff", userSelect: "none",
                          }}
                        >
                          {initials(name)}
                        </div>
                      )}

                      {/* Name + username */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 15, fontWeight: 600,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          color: isSelected ? "#5EA8FF" : "#fff",
                        }}>
                          {friend.display_name ?? `@${friend.username}`}
                        </div>
                        {friend.username && (
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>
                            @{friend.username}
                          </div>
                        )}
                      </div>

                      {/* Selection indicator — circle */}
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: isSelected ? "#5EA8FF" : "rgba(255,255,255,0.09)",
                        border: isSelected ? "none" : "1px solid rgba(255,255,255,0.20)",
                        transition: "background 0.15s, border 0.15s",
                      }}>
                        {isSelected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
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

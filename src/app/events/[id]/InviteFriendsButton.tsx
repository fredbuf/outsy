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
  const [friends, setFriends] = useState<FriendProfile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  async function openModal() {
    if (!session) {
      window.dispatchEvent(new Event("outsy:open-signin"));
      return;
    }
    setOpen(true);
    setDoneCount(null);
    setSelected(new Set());
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
    setTimeout(() => {
      setOpen(false);
      setDoneCount(null);
    }, 1800);
  }

  // Hide for logged-out users — they see the Sign in prompt from the page itself
  if (!user) return null;

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
      {open && createPortal(
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: "fixed", inset: 0, zIndex: 300,
            background: "rgba(0,0,0,0.72)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              borderRadius: "20px 20px 0 0",
              width: "100%",
              maxWidth: 540,
              maxHeight: "72dvh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Sheet header */}
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "16px 20px 12px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <div style={{ width: 28, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Invite friends</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 20, opacity: 0.5, lineHeight: 1, color: "inherit",
                  width: 28, flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Friend list */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {doneCount !== null ? (
                <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 15, fontWeight: 600 }}>
                  Invited {doneCount} {doneCount === 1 ? "friend" : "friends"} ✓
                </div>
              ) : loading ? (
                <div style={{ padding: "40px 20px", textAlign: "center", opacity: 0.4, fontSize: 14 }}>
                  Loading…
                </div>
              ) : !friends || friends.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", opacity: 0.4, fontSize: 14, lineHeight: 1.6 }}>
                  No friends to invite yet.<br />Add friends from their profile.
                </div>
              ) : (
                <div style={{ paddingBlock: 6 }}>
                  {friends.map((friend) => {
                    const name = friend.display_name ?? friend.username ?? "User";
                    const isSelected = selected.has(friend.id);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => toggle(friend.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          width: "100%", padding: "10px 20px",
                          background: isSelected ? "var(--surface-subtle)" : "transparent",
                          border: "none", cursor: "pointer", textAlign: "left",
                          transition: "background 0.12s",
                        }}
                      >
                        {friend.avatar_url ? (
                          <img
                            src={friend.avatar_url}
                            alt={name}
                            style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 38, height: 38, borderRadius: "50%",
                              background: avatarColor(name), flexShrink: 0,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none",
                            }}
                          >
                            {initials(name)}
                          </div>
                        )}
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{name}</span>
                        {/* Checkbox */}
                        <div
                          style={{
                            width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                            border: isSelected ? "none" : "1.5px solid var(--border-strong)",
                            background: isSelected ? "var(--accent)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "background 0.12s",
                          }}
                        >
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Send button — only when list is loaded and not yet done */}
            {doneCount === null && !loading && friends && friends.length > 0 && (
              <div
                style={{
                  padding: "12px 20px",
                  paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                  borderTop: "1px solid var(--border)",
                  flexShrink: 0,
                }}
              >
                <button
                  type="button"
                  onClick={sendInvites}
                  disabled={selected.size === 0 || sending}
                  style={{
                    width: "100%", padding: "13px 0",
                    borderRadius: 12, border: "none",
                    background: selected.size === 0 || sending ? "var(--surface-raised)" : "var(--accent)",
                    color: selected.size === 0 || sending ? "inherit" : "#fff",
                    fontWeight: 700, fontSize: 15,
                    cursor: selected.size === 0 || sending ? "not-allowed" : "pointer",
                    opacity: selected.size === 0 || sending ? 0.5 : 1,
                    transition: "background 0.15s, opacity 0.15s",
                  }}
                >
                  {sending
                    ? "Sending…"
                    : selected.size === 0
                    ? "Select friends to invite"
                    : `Invite ${selected.size} ${selected.size === 1 ? "friend" : "friends"}`}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

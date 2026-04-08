/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { MomentRow } from "./page";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_EMOJI = ["❤️", "🔥", "👏", "🙌", "✨"] as const;
type ValidEmoji = (typeof VALID_EMOJI)[number];
const BODY_MAX = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts":     case "music":  return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":                   return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": case "art":    return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":                      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":                      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":                      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:                            return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ReactionGroup = {
  emoji: ValidEmoji;
  count: number;
  isMine: boolean;
};

type DisplayMoment = {
  id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  reactions_enabled: boolean;
  created_at: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
  reactionGroups: ReactionGroup[];
  // raw reactions kept for local mutation
  rawReactions: { user_id: string; emoji: string }[];
  commentCount: number;
};

type CommentRow = {
  id: string;
  moment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
};

// ── Data transforms ───────────────────────────────────────────────────────────

function buildDisplay(row: MomentRow, currentUserId: string | null): DisplayMoment {
  const author = row.profiles
    ? Array.isArray(row.profiles)
      ? (row.profiles[0] ?? null)
      : row.profiles
    : null;

  const rawReactions = row.moment_reactions ?? [];

  const grouped = new Map<string, { count: number; isMine: boolean }>();
  for (const r of rawReactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, isMine: false };
    entry.count += 1;
    if (r.user_id === currentUserId) entry.isMine = true;
    grouped.set(r.emoji, entry);
  }

  const reactionGroups: ReactionGroup[] = VALID_EMOJI.map((emoji) => {
    const e = grouped.get(emoji);
    return { emoji, count: e?.count ?? 0, isMine: e?.isMine ?? false };
  });

  return {
    id: row.id,
    author_id: row.author_id,
    body: row.body,
    is_pinned: row.is_pinned,
    reactions_enabled: row.reactions_enabled,
    created_at: row.created_at,
    author,
    reactionGroups,
    rawReactions,
    commentCount: row.comment_count ?? 0,
  };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  url,
  name,
  size = 36,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  return url ? (
    <img
      src={url}
      alt={name ?? ""}
      style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, display: "block",
      }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: getAvatarColor(name),
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.35), fontWeight: 700, color: "#fff", userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Compose area ──────────────────────────────────────────────────────────────

type PostedMoment = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  reactions_enabled: boolean;
  created_at: string;
};

function ComposeArea({
  eventId,
  isHostOrCohost,
  token,
  onPosted,
}: {
  eventId: string;
  isHostOrCohost: boolean;
  token: string;
  onPosted: (moment: PostedMoment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleOpen() {
    setOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 60);
  }

  function handleCancel() {
    setOpen(false);
    setText("");
    setReactionsEnabled(true);
    setIsPinned(false);
    setError(null);
  }

  async function handlePost() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/moments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body: text.trim(),
          reactions_enabled: reactionsEnabled,
          is_pinned: isPinned,
        }),
      });
      const data = (await res.json()) as { ok: boolean; moment?: PostedMoment; error?: string };
      if (data.ok && data.moment) {
        handleCancel();
        onPosted(data.moment);
      } else {
        setError(data.error ?? "Failed to post.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          padding: "28px 16px 24px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer",
          textAlign: "center",
          color: "rgba(255,255,255,0.50)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Share a moment</span>
      </button>
    );
  }

  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.14)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        overflow: "hidden",
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={BODY_MAX}
        placeholder="Share a moment with attendees…"
        rows={4}
        style={{
          width: "100%",
          padding: "14px 16px 0",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "inherit",
          fontSize: 16,
          lineHeight: 1.55,
          resize: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />

      {/* Character count */}
      <div style={{ padding: "4px 16px 0", textAlign: "right" }}>
        <span style={{ fontSize: 11, opacity: text.length > BODY_MAX * 0.85 ? 0.7 : 0.3 }}>
          {text.length}/{BODY_MAX}
        </span>
      </div>

      {/* Toggles */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "10px 16px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          marginTop: 8,
          flexWrap: "wrap",
        }}
      >
        {/* Reactions toggle */}
        <label
          style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 13, cursor: "pointer", userSelect: "none",
          }}
        >
          <span
            role="checkbox"
            aria-checked={reactionsEnabled}
            tabIndex={0}
            onClick={() => setReactionsEnabled((v) => !v)}
            onKeyDown={(e) => e.key === " " && setReactionsEnabled((v) => !v)}
            style={{
              width: 32, height: 18, borderRadius: 9,
              background: reactionsEnabled ? "var(--accent, #a78bfa)" : "rgba(255,255,255,0.15)",
              position: "relative", flexShrink: 0, cursor: "pointer",
              transition: "background 0.15s",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 3, left: reactionsEnabled ? 17 : 3,
                width: 12, height: 12, borderRadius: "50%",
                background: "#fff",
                transition: "left 0.15s",
              }}
            />
          </span>
          Reactions
        </label>

        {/* Pin toggle — host/cohost only */}
        {isHostOrCohost && (
          <label
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 13, cursor: "pointer", userSelect: "none",
            }}
          >
            <span
              role="checkbox"
              aria-checked={isPinned}
              tabIndex={0}
              onClick={() => setIsPinned((v) => !v)}
              onKeyDown={(e) => e.key === " " && setIsPinned((v) => !v)}
              style={{
                width: 32, height: 18, borderRadius: 9,
                background: isPinned ? "var(--accent, #a78bfa)" : "rgba(255,255,255,0.15)",
                position: "relative", flexShrink: 0, cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 3, left: isPinned ? 17 : 3,
                  width: 12, height: 12, borderRadius: "50%",
                  background: "#fff",
                  transition: "left 0.15s",
                }}
              />
            </span>
            Pin to top
          </label>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: "0 16px 8px", fontSize: 13, color: "#ef4444" }}>{error}</div>
      )}

      {/* Action row */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "10px 14px 14px",
        }}
      >
        <button
          type="button"
          onClick={handleCancel}
          style={{
            padding: "7px 16px", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent", color: "inherit",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handlePost}
          disabled={!text.trim() || submitting}
          style={{
            padding: "7px 20px", borderRadius: 20,
            border: "none",
            background: !text.trim() || submitting ? "rgba(167,139,250,0.35)" : "var(--accent, #a78bfa)",
            color: "#fff", fontSize: 13, fontWeight: 700,
            cursor: !text.trim() || submitting ? "not-allowed" : "pointer",
            transition: "background 0.15s",
          }}
        >
          {submitting ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

// ── Comments sheet ────────────────────────────────────────────────────────────

function CommentsSheet({
  open,
  onClose,
  momentId,
  eventId,
  token,
  currentUser,
  onCommentPosted,
}: {
  open: boolean;
  onClose: () => void;
  momentId: string;
  eventId: string;
  token: string | null;
  currentUser: { id: string; display_name?: string | null; avatar_url?: string | null } | null;
  onCommentPosted: () => void;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch comments when sheet opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/events/${eventId}/moments/${momentId}/comments`)
      .then((r) => r.json())
      .then((data: { ok: boolean; comments?: CommentRow[] }) => {
        if (data.ok && data.comments) setComments(data.comments);
      })
      .finally(() => setLoading(false));
  }, [open, eventId, momentId]);

  // Scroll to bottom when comments load
  useEffect(() => {
    if (!loading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [loading, comments.length]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !token) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/moments/${momentId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = (await res.json()) as { ok: boolean; comment?: CommentRow; error?: string };
      if (data.ok && data.comment) {
        setComments((prev) => [...prev, data.comment!]);
        setText("");
        onCommentPosted();
        // Scroll to bottom after adding
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 30);
      } else {
        setError(data.error ?? "Failed to send.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.55)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "max(0px, calc(50% - 270px))",
          right: "max(0px, calc(50% - 270px))",
          height: "85dvh",
          zIndex: 301,
          borderRadius: "22px 22px 0 0",
          background: "#111110",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Drag handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.18)" }} />
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "6px 16px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F7FA" }}>Comments</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "rgba(255,255,255,0.55)", padding: 4,
              display: "flex", alignItems: "center",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Comments list */}
        <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {loading && (
            <p style={{ fontSize: 13, opacity: 0.4, textAlign: "center", paddingTop: 24, color: "#F5F7FA" }}>
              Loading…
            </p>
          )}
          {!loading && comments.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", opacity: 0.4 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 10px", color: "#F5F7FA" }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0, color: "#F5F7FA" }}>No comments yet</p>
            </div>
          )}
          {!loading && comments.map((c) => {
            const name = c.author?.display_name ?? c.author?.username ?? "Someone";
            return (
              <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <div style={{ flexShrink: 0 }}>
                  <Avatar url={c.author?.avatar_url ?? null} name={name} size={30} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F7FA" }}>{name}</span>
                    <span style={{ fontSize: 11, opacity: 0.4, color: "#F5F7FA" }}>{relativeTime(c.created_at)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "rgba(245,247,250,0.85)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Compose area */}
        <div
          style={{
            flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "10px 12px",
            paddingBottom: "max(10px, env(safe-area-inset-bottom))",
            background: "#111110",
          }}
        >
          {!token ? (
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
              style={{
                width: "100%", padding: "10px 0", borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.14)", background: "transparent",
                color: "rgba(255,255,255,0.55)", fontSize: 14, cursor: "pointer",
              }}
            >
              Sign in to comment
            </button>
          ) : (
            <>
              {error && (
                <p style={{ fontSize: 12, color: "#ef4444", margin: "0 0 6px 4px" }}>{error}</p>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Add a comment…"
                  rows={1}
                  maxLength={1000}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: 20,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.07)",
                    color: "#F5F7FA",
                    fontSize: 15,
                    lineHeight: 1.4,
                    resize: "none",
                    outline: "none",
                    fontFamily: "inherit",
                    minHeight: 42,
                    maxHeight: 120,
                    overflowY: "auto",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!text.trim() || sending}
                  style={{
                    width: 42, height: 42, borderRadius: "50%",
                    border: "none",
                    background: !text.trim() || sending ? "rgba(94,168,255,0.25)" : "#5EA8FF",
                    color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: !text.trim() || sending ? "not-allowed" : "pointer",
                    flexShrink: 0,
                    transition: "background 0.15s",
                  }}
                  aria-label="Send comment"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Moment card ────────────────────────────────────────────────────────────────

function MomentCard({
  moment,
  eventId,
  currentUserId,
  isHostOrCohost,
  guestsCanReact,
  token,
  highlighted,
  onDeleted,
  onPinToggled,
  onReactionToggle,
  onCommentClick,
}: {
  moment: DisplayMoment;
  eventId: string;
  currentUserId: string | null;
  isHostOrCohost: boolean;
  guestsCanReact: boolean;
  token: string | null;
  highlighted: boolean;
  onDeleted: (id: string) => void;
  onPinToggled: (id: string, pinned: boolean) => void;
  onReactionToggle: (momentId: string, emoji: ValidEmoji, add: boolean) => void;
  onCommentClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Scroll into view when highlighted via deep-link
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const authorName = moment.author?.display_name ?? moment.author?.username ?? "Unknown";
  const canManage =
    isHostOrCohost || (currentUserId != null && currentUserId === moment.author_id);
  const canReact =
    currentUserId != null && (isHostOrCohost || guestsCanReact) && moment.reactions_enabled;

  async function handleDelete() {
    if (!token || deleting) return;
    setDeleting(true);
    setMenuOpen(false);
    try {
      await fetch(`/api/events/${eventId}/moments/${moment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDeleted(moment.id);
    } catch {
      setDeleting(false);
    }
  }

  async function handlePinToggle() {
    if (!token) return;
    setMenuOpen(false);
    const newPinned = !moment.is_pinned;
    onPinToggled(moment.id, newPinned);
    await fetch(`/api/events/${eventId}/moments/${moment.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ is_pinned: newPinned }),
    });
  }

  async function handleReaction(emoji: ValidEmoji) {
    if (!token || !canReact) return;
    const group = moment.reactionGroups.find((g) => g.emoji === emoji);
    const adding = !group?.isMine;
    onReactionToggle(moment.id, emoji, adding);
    const method = adding ? "POST" : "DELETE";
    await fetch(`/api/events/${eventId}/moments/${moment.id}/reactions`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ emoji }),
    });
  }

  return (
    <div
      ref={ref}
      style={{
        borderRadius: 16,
        background: highlighted
          ? "rgba(167,139,250,0.10)"
          : "rgba(255,255,255,0.05)",
        border: highlighted
          ? "1px solid rgba(167,139,250,0.35)"
          : "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "14px 16px",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Pinned label */}
      {moment.is_pinned && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 700, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16 9V4l1 0a2 2 0 0 0 0-4H7a2 2 0 0 0 0 4l1 0v5c0 1.1-.9 2-2 2H4v2h7v7l1 1 1-1v-7h7v-2h-2a2 2 0 0 1-2-2z"/>
          </svg>
          Pinned
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <Avatar url={moment.author?.avatar_url ?? null} name={authorName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{authorName}</div>
          <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1 }}>
            {relativeTime(moment.created_at)}
          </div>
        </div>

        {/* Context menu — author or host */}
        {canManage && !deleting && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "inherit", opacity: 0.45, padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>

            {menuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  style={{
                    position: "absolute", right: 0, top: "100%", zIndex: 20,
                    background: "var(--background, #0e0807)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 12, overflow: "hidden",
                    minWidth: 150,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  }}
                >
                  {isHostOrCohost && (
                    <button
                      type="button"
                      onClick={handlePinToggle}
                      style={{
                        display: "block", width: "100%", padding: "11px 16px",
                        background: "transparent", border: "none",
                        textAlign: "left", fontSize: 14, cursor: "pointer",
                        color: "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {moment.is_pinned ? "Unpin" : "Pin to top"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{
                      display: "block", width: "100%", padding: "11px 16px",
                      background: "transparent", border: "none",
                      textAlign: "left", fontSize: 14, cursor: "pointer",
                      color: "#ef4444",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {deleting && (
          <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>Deleting…</span>
        )}
      </div>

      {/* Body */}
      <p style={{ margin: "0 0 12px", fontSize: 15, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {moment.body}
      </p>

      {/* Footer: reactions + comment button */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: moment.reactions_enabled ? 0 : 4 }}>
        {/* Reactions */}
        {moment.reactions_enabled && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
            {moment.reactionGroups.map(({ emoji, count, isMine }) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleReaction(emoji)}
                disabled={!canReact}
                title={canReact ? (isMine ? `Remove ${emoji}` : `React with ${emoji}`) : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 20,
                  border: isMine
                    ? "1px solid rgba(167,139,250,0.55)"
                    : "1px solid rgba(255,255,255,0.12)",
                  background: isMine
                    ? "rgba(167,139,250,0.15)"
                    : "rgba(255,255,255,0.05)",
                  cursor: canReact ? "pointer" : "default",
                  fontSize: 14,
                  transition: "background 0.12s, border-color 0.12s",
                }}
              >
                <span>{emoji}</span>
                {count > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.75 }}>{count}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Comment button */}
        <button
          type="button"
          onClick={onCommentClick}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.05)",
            color: "rgba(255,255,255,0.55)",
            fontSize: 13, cursor: "pointer",
            transition: "background 0.12s",
            marginLeft: moment.reactions_enabled ? "auto" : 0,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span style={{ fontWeight: 600 }}>
            {moment.commentCount > 0 ? moment.commentCount : ""}
          </span>
          <span>{moment.commentCount === 1 ? "comment" : moment.commentCount > 1 ? "comments" : "Comment"}</span>
        </button>
      </div>
    </div>
  );
}

// ── Main client component ──────────────────────────────────────────────────────

export function MomentsClient({
  eventId,
  eventTitle,
  eventImageUrl,
  eventCategory,
  creatorId,
  cohostIds,
  guestsCanPost,
  guestsCanReact,
  initialMoments,
  embedded = false,
}: {
  eventId: string;
  eventTitle: string;
  eventImageUrl: string | null;
  eventCategory: string;
  creatorId: string | null;
  cohostIds: string[];
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  /** When true, skip the outer main/ambient/nav/tabs — parent provides the shell */
  embedded?: boolean;
}) {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const deepLinkedMomentId = searchParams.get("moment");

  const isHostOrCohost =
    user != null &&
    (user.id === creatorId || cohostIds.includes(user.id));

  const canPost = isHostOrCohost || (user != null && guestsCanPost);

  const [moments, setMoments] = useState<DisplayMoment[]>(() =>
    initialMoments.map((m) => buildDisplay(m, user?.id ?? null))
  );
  const [commentSheetMomentId, setCommentSheetMomentId] = useState<string | null>(null);

  // When user identity resolves, update only the isMine flags on existing moments.
  // Do NOT reset to initialMoments — that would overwrite any moments loaded by
  // fetchMoments() after a post, causing recently created moments to disappear.
  useEffect(() => {
    const userId = user?.id ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoments((prev) =>
      prev.map((m) => ({
        ...m,
        reactionGroups: VALID_EMOJI.map((emoji) => ({
          emoji,
          count: m.rawReactions.filter((r) => r.emoji === emoji).length,
          isMine: m.rawReactions.some((r) => r.emoji === emoji && r.user_id === userId),
        })),
      }))
    );
  }, [user?.id]);

  const fetchMoments = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/moments`, {
        // Bypass browser/CDN cache — always read latest rows from Supabase.
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; moments?: MomentRow[]; error?: string };
      if (data.ok && data.moments) {
        setMoments(data.moments.map((m) => buildDisplay(m, user?.id ?? null)));
      } else if (!data.ok) {
        console.error("[fetchMoments] API error:", data.error);
      }
    } catch (err) {
      console.error("[fetchMoments] network error:", err);
    }
  }, [eventId, user?.id]);

  // On mount, immediately fetch fresh moments from the API to override any stale
  // initialMoments that the server may have delivered (router cache, data cache,
  // or brief Supabase replication lag can all cause initialMoments to lag behind).
  // Guard with a ref so auth-driven fetchMoments recreations don't cause extra fetches.
  const fetchedOnMount = useRef(false);
  useEffect(() => {
    if (fetchedOnMount.current) return;
    fetchedOnMount.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMoments();
  }, [fetchMoments]);

  function handlePosted(newMoment: PostedMoment) {
    // Optimistically prepend so it appears immediately
    const optimistic: DisplayMoment = {
      id: newMoment.id,
      author_id: newMoment.author_id,
      body: newMoment.body,
      is_pinned: newMoment.is_pinned,
      reactions_enabled: newMoment.reactions_enabled,
      created_at: newMoment.created_at,
      author: null,
      reactionGroups: VALID_EMOJI.map((emoji) => ({ emoji, count: 0, isMine: false })),
      rawReactions: [],
      commentCount: 0,
    };
    setMoments((prev) => {
      const unpinned = newMoment.is_pinned
        ? prev.map((m) => ({ ...m, is_pinned: false }))
        : prev;
      return [optimistic, ...unpinned];
    });
    // Background refetch to populate author profiles
    fetchMoments();
  }

  function handleDeleted(id: string) {
    setMoments((prev) => prev.filter((m) => m.id !== id));
  }

  function handlePinToggled(id: string, pinned: boolean) {
    setMoments((prev) =>
      prev.map((m) => {
        if (m.id === id) return { ...m, is_pinned: pinned };
        if (pinned && m.is_pinned) return { ...m, is_pinned: false };
        return m;
      })
      .sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
    );
  }

  function handleReactionToggle(momentId: string, emoji: ValidEmoji, add: boolean) {
    setMoments((prev) =>
      prev.map((m) => {
        if (m.id !== momentId) return m;
        const groups = m.reactionGroups.map((g) => {
          if (g.emoji !== emoji) return g;
          return {
            ...g,
            count: add ? g.count + 1 : Math.max(0, g.count - 1),
            isMine: add,
          };
        });
        return { ...m, reactionGroups: groups };
      })
    );
  }

  function handleCommentPosted(momentId: string) {
    setMoments((prev) =>
      prev.map((m) =>
        m.id === momentId ? { ...m, commentCount: m.commentCount + 1 } : m
      )
    );
  }

  const isEmpty = moments.length === 0;

  const content = (
    <div
      style={{
        color: "#eae8e4",
        "--border": "rgba(255,255,255,0.10)",
        "--border-strong": "rgba(255,255,255,0.18)",
        "--btn-bg": "rgba(255,255,255,0.07)",
        "--surface-raised": "rgba(255,255,255,0.08)",
        "--background": "rgba(20,11,7,0.55)",
        "--foreground": "#eae8e4",
        "--accent": "#a78bfa",
      } as React.CSSProperties}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* Compose — visible to users who can post */}
        {canPost && session && (
          <div style={{ marginBottom: 20 }}>
            <ComposeArea
              eventId={eventId}
              isHostOrCohost={isHostOrCohost}
              token={session.access_token}
              onPosted={handlePosted}
            />
          </div>
        )}

        {/* Sign-in nudge for guests who can't post */}
        {!user && (
          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
              style={{
                fontSize: 13, opacity: 0.5, background: "none",
                border: "none", cursor: "pointer", color: "inherit",
                textDecoration: "underline",
              }}
            >
              Sign in to react or post
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <div style={{ opacity: 0.15, marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.55, margin: "0 0 6px" }}>
              No moments yet
            </p>
            <p style={{ fontSize: 13, opacity: 0.35, margin: 0 }}>
              {isHostOrCohost
                ? "Share updates, hype, and reminders with your attendees."
                : "The host hasn't posted anything yet."}
            </p>
          </div>
        )}

        {/* Moments list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {moments.map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              eventId={eventId}
              currentUserId={user?.id ?? null}
              isHostOrCohost={isHostOrCohost}
              guestsCanReact={guestsCanReact}
              token={session?.access_token ?? null}
              highlighted={moment.id === deepLinkedMomentId}
              onDeleted={handleDeleted}
              onPinToggled={handlePinToggled}
              onReactionToggle={handleReactionToggle}
              onCommentClick={() => setCommentSheetMomentId(moment.id)}
            />
          ))}
        </div>

      </div>
    </div>
  );

  const activeCommentMoment = commentSheetMomentId
    ? moments.find((m) => m.id === commentSheetMomentId) ?? null
    : null;

  const commentsSheet = (
    <CommentsSheet
      key={commentSheetMomentId ?? "none"}
      open={commentSheetMomentId !== null}
      onClose={() => setCommentSheetMomentId(null)}
      momentId={commentSheetMomentId ?? ""}
      eventId={eventId}
      token={session?.access_token ?? null}
      currentUser={activeCommentMoment ? { id: activeCommentMoment.author_id } : null}
      onCommentPosted={() => {
        if (commentSheetMomentId) handleCommentPosted(commentSheetMomentId);
      }}
    />
  );

  if (embedded) return <>{content}{commentsSheet}</>;

  return (
    <main style={{ padding: 0, position: "relative", minHeight: "100dvh" }}>

      {/* Ambient background */}
      {eventImageUrl ? (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img
            src={eventImageUrl}
            alt=""
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(80px) saturate(1.8) brightness(0.38)",
              transform: "scale(1.15)",
              pointerEvents: "none",
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: "fixed", inset: 0, zIndex: 0,
            background: categoryBg(eventCategory),
            opacity: 0.6,
            pointerEvents: "none",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Top nav bar */}
        <div
          style={{
            display: "flex", alignItems: "center",
            padding: "16px 16px 0",
            gap: 12,
          }}
        >
          <Link
            href={`/events/${eventId}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(0,0,0,0.32)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff", flexShrink: 0,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              textDecoration: "none",
            }}
            aria-label="Back to event"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, opacity: 0.45,
              textTransform: "uppercase", letterSpacing: "0.07em",
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
              color: "#fff",
            }}>
              {eventTitle}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div
          style={{
            display: "flex", gap: 4, margin: "14px 16px 0",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12, padding: 3,
          }}
        >
          <Link
            href={`/events/${eventId}`}
            style={{
              flex: 1, textDecoration: "none",
              textAlign: "center", padding: "7px 0",
              borderRadius: 9, fontSize: 14, fontWeight: 600,
              color: "rgba(255,255,255,0.50)",
            }}
          >
            Info
          </Link>
          <div
            style={{
              flex: 1, textAlign: "center", padding: "7px 0",
              borderRadius: 9, fontSize: 14, fontWeight: 600,
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          >
            Moments
          </div>
        </div>

        {content}
      </div>
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { MessageRow } from "@/app/api/social/messages/[userId]/route";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric",
  });
}

function smartEventDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const toKey = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const eventDay = toKey(d);
  const today = toKey(now);
  const tomorrow = toKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });
  const isUnknownTime = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  const timeStr = isUnknownTime ? "" : " · " + rawTime;
  if (eventDay === today)    return `Today${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow${timeStr}`;
  return d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" }) + timeStr;
}

type OtherUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  custom_avatar_url?: string | null;
};

// ── Shared event card ──────────────────────────────────────────────────────────

function EventCard({ msg }: { msg: MessageRow }) {
  const ev = msg.event;
  if (!ev) return null;
  const dateStr = smartEventDate(ev.start_at);

  return (
    <Link
      href={`/events/${ev.id}`}
      className="card-enter"
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          width: 220,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.30)",
          cursor: "pointer",
        }}
      >
        {ev.image_url ? (
          <img
            src={ev.image_url}
            alt=""
            style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: 80,
            background: "rgba(94,168,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
        )}
        <div style={{ padding: "10px 12px 12px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, color: "#fff", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {ev.title}
          </div>
          {dateStr && (
            <div style={{ fontSize: 11, color: "#5EA8FF", marginTop: 4, fontWeight: 500 }}>{dateStr}</div>
          )}
          {ev.venue_name && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {ev.venue_name}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Long-press hook ────────────────────────────────────────────────────────────

function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    timer.current = setTimeout(onLongPress, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  return {
    onPointerDown: start,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
  };
}

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  isMe,
  actionMsgId,
  editingId,
  editDraft,
  editError,
  deleteError,
  onLongPress,
  onEditOpen,
  onEditDraftChange,
  onEditSave,
  onEditCancel,
  onDelete,
  onActionClose,
}: {
  msg: MessageRow;
  isMe: boolean;
  actionMsgId: string | null;
  editingId: string | null;
  editDraft: string;
  editError: string | null;
  deleteError: string | null;
  onLongPress: (msg: MessageRow) => void;
  onEditOpen: (msg: MessageRow) => void;
  onEditDraftChange: (v: string) => void;
  onEditSave: (msg: MessageRow) => void;
  onEditCancel: () => void;
  onDelete: (msg: MessageRow) => void;
  onActionClose: () => void;
}) {
  const isDeleted = !!msg.deleted_at;
  const isEditing = editingId === msg.id;
  const canAct = isMe && !isDeleted && !msg.event_id;
  const [now] = useState(() => Date.now());
  const ageMs = now - new Date(msg.created_at).getTime();
  const canEdit = canAct && ageMs < 30_000;
  const showActions = actionMsgId === msg.id;

  const longPress = useLongPress(() => {
    if (canAct) onLongPress(msg);
  });

  if (isEditing) {
    return (
      <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
        <textarea
          autoFocus
          value={editDraft}
          onChange={(e) => onEditDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEditSave(msg); }
            if (e.key === "Escape") onEditCancel();
          }}
          maxLength={2000}
          rows={2}
          style={{
            width: "100%", minWidth: 180, resize: "none", borderRadius: 14,
            border: "1px solid rgba(94,168,255,0.45)", padding: "8px 12px",
            fontSize: 15, lineHeight: 1.5, background: "rgba(255,255,255,0.10)",
            color: "#fff", outline: "none", fontFamily: "inherit",
          }}
        />
        {editError && <span style={{ fontSize: 12, color: "#f87171" }}>{editError}</span>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onEditCancel} style={{ fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "4px 10px", color: "rgba(255,255,255,0.6)", cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onEditSave(msg)} style={{ fontSize: 12, background: "rgba(37,99,235,0.8)", border: "none", borderRadius: 8, padding: "4px 10px", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={isMe ? "msg-enter-me" : "msg-enter-them"}
        {...(canAct ? longPress : {})}
        style={{
          maxWidth: "72%",
          padding: "10px 15px",
          borderRadius: isMe ? "18px 18px 5px 18px" : "18px 18px 18px 5px",
          background: isDeleted
            ? "rgba(255,255,255,0.04)"
            : isMe
            ? "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)"
            : "rgba(255,255,255,0.08)",
          border: isDeleted
            ? "1px solid rgba(255,255,255,0.06)"
            : isMe
            ? "1px solid rgba(94,168,255,0.20)"
            : "1px solid rgba(255,255,255,0.09)",
          boxShadow: isMe && !isDeleted ? "0 2px 12px rgba(59,130,246,0.25)" : "none",
          color: "#fff",
          fontSize: 15,
          lineHeight: 1.5,
          wordBreak: "break-word",
          userSelect: canAct ? "none" : undefined,
          touchAction: canAct ? "none" : undefined,
        }}
      >
        {isDeleted
          ? <span style={{ opacity: 0.35, fontStyle: "italic", fontSize: 14 }}>Message deleted</span>
          : msg.body
        }
      </div>

      {/* Inline action strip */}
      {showActions && (
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          {canEdit && (
            <button
              onClick={() => { onActionClose(); onEditOpen(msg); }}
              style={{ fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "5px 12px", color: "#fff", cursor: "pointer" }}
            >
              Edit
            </button>
          )}
          <button
            onClick={() => onDelete(msg)}
            style={{ fontSize: 12, fontWeight: 600, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.30)", borderRadius: 8, padding: "5px 12px", color: "#f87171", cursor: "pointer" }}
          >
            Delete
          </button>
          <button
            onClick={onActionClose}
            style={{ fontSize: 12, background: "none", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 8, padding: "5px 10px", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}
          >
            ×
          </button>
          {deleteError && <span style={{ fontSize: 12, color: "#f87171", alignSelf: "center" }}>{deleteError}</span>}
        </div>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams<{ userId: string }>();
  const otherId = params.userId;
  const { user, session, loading: authLoading } = useAuth();

  const [otherUser, setOtherUser]     = useState<OtherUser | null>(null);
  const [messages, setMessages]       = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [draft, setDraft]             = useState("");
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState<string | null>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatRef     = useRef<HTMLDivElement>(null);

  // Message actions
  const [actionMsg, setActionMsg]       = useState<MessageRow | null>(null);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editDraft, setEditDraft]       = useState("");
  const [editError, setEditError]       = useState<string | null>(null);
  const [deleteError, setDeleteError]   = useState<string | null>(null);

  async function fetchMessages() {
    if (!session) return;
    const res = await fetch(`/api/social/messages/${otherId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = (await res.json()) as {
      ok: boolean;
      messages?: MessageRow[];
      otherUser?: OtherUser;
      error?: string;
    };
    if (data.ok) {
      setMessages(data.messages ?? []);
      if (data.otherUser) setOtherUser(data.otherUser);
    }
    setLoadingMsgs(false);
  }

  useEffect(() => {
    if (!authLoading && session) fetchMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  // Scroll to bottom when messages load or a new one arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // iOS Safari keyboard fix — shrink container to visual viewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let rafId: number;
    function adjust() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const el = chatRef.current;
        if (!el || !vv) return;
        el.style.height = `${vv.height}px`;
        el.style.top    = `${vv.offsetTop}px`;
      });
    }
    vv.addEventListener("resize", adjust);
    vv.addEventListener("scroll", adjust);
    adjust();
    return () => {
      vv.removeEventListener("resize", adjust);
      vv.removeEventListener("scroll", adjust);
      cancelAnimationFrame(rafId);
    };
  }, []);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !session) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/social/messages/${otherId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as { ok: boolean; message?: MessageRow; error?: string };
      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message!]);
        setDraft("");
        // Reset textarea height
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
          textareaRef.current.focus();
        }
      } else {
        setSendError(data.error ?? "Failed to send.");
      }
    } catch {
      setSendError("Network error.");
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleEdit(msg: MessageRow) {
    if (!session) return;
    setEditError(null);
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/social/messages/${otherId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ messageId: msg.id, body: trimmed }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, body: trimmed } : m));
      setEditingId(null);
      setEditDraft("");
    } else {
      setEditError(data.error ?? "Failed to edit.");
    }
  }

  async function handleDelete(msg: MessageRow) {
    if (!session) return;
    setDeleteError(null);
    const res = await fetch(`/api/social/messages/${otherId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ messageId: msg.id }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.ok) {
      setMessages((prev) => prev.map((m) => m.id === msg.id ? { ...m, body: "", deleted_at: new Date().toISOString() } : m));
      setActionMsg(null);
    } else {
      setDeleteError(data.error ?? "Failed to delete.");
    }
  }

  if (authLoading) return null;

  if (!user || !session) {
    return (
      <main style={{ maxWidth: 540, margin: "0 auto", padding: "48px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 15, opacity: 0.6 }}>Sign in to view messages.</p>
      </main>
    );
  }

  const otherName = otherUser?.display_name ?? otherUser?.username ?? "User";

  return (
    <div ref={chatRef} className="chat-screen">

      {/* ── Header — 3-column centered identity ───────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "52px 1fr 52px",
          alignItems: "center",
          padding: "10px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "linear-gradient(180deg, rgba(28,37,53,0.96) 0%, rgba(13,19,32,0.92) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Back button */}
        <Link
          href="/social?tab=messages"
          aria-label="Back"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.10)",
            textDecoration: "none",
            color: "rgba(255,255,255,0.70)",
            transition: "background 0.15s",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>

        {/* Centered identity block */}
        <Link
          href={`/profile/${otherId}`}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textDecoration: "none" }}
        >
          {otherUser ? (
            <GeneratedAvatar name={otherName} imageUrl={otherUser.custom_avatar_url ?? null} size={40} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          )}
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{otherName}</div>
            {otherUser?.username && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>@{otherUser.username}</div>
            )}
          </div>
        </Link>

        {/* Right spacer — keeps grid balanced */}
        <div />
      </div>

      {/* ── Message thread ── */}
      <div
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: "20px 16px 12px",
          display: "flex", flexDirection: "column", gap: 2,
          position: "relative", zIndex: 1,
        }}
      >
        {loadingMsgs ? (
          <div style={{ margin: "auto", color: "rgba(255,255,255,0.30)", fontSize: 14 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", padding: "40px 0" }}>
            <div style={{ marginBottom: 14, display: "flex", justifyContent: "center", opacity: 0.18 }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", margin: 0 }}>No messages yet</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", marginTop: 4 }}>Say hello 👋</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.sender_id === user.id;
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showTime = !prevMsg
              || prevMsg.sender_id !== msg.sender_id
              || (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) > 3 * 60 * 1000;

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  gap: 2,
                  marginTop: showTime ? 10 : 2,
                }}
              >
                {msg.event_id ? (
                  <EventCard msg={msg} />
                ) : (
                  <MessageBubble
                    msg={msg}
                    isMe={isMe}
                    actionMsgId={actionMsg?.id ?? null}
                    editingId={editingId}
                    editDraft={editDraft}
                    editError={editError}
                    deleteError={deleteError}
                    onLongPress={(m) => { setActionMsg(m); setDeleteError(null); }}
                    onEditOpen={(m) => { setEditingId(m.id); setEditDraft(m.body); }}
                    onEditDraftChange={setEditDraft}
                    onEditSave={(m) => void handleEdit(m)}
                    onEditCancel={() => { setEditingId(null); setEditDraft(""); setEditError(null); }}
                    onDelete={(m) => void handleDelete(m)}
                    onActionClose={() => { setActionMsg(null); setDeleteError(null); }}
                  />
                )}
                {showTime && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", paddingInline: 4, marginTop: 1 }}>
                    {formatTime(msg.created_at)}
                  </span>
                )}
              </div>
            );
          })
        )}

        {/* In-flight sending indicator */}
        {sending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginTop: 10 }}>
            <div
              className="msg-enter-me"
              style={{
                maxWidth: "72%", padding: "10px 15px",
                borderRadius: "18px 18px 5px 18px",
                background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                border: "1px solid rgba(94,168,255,0.20)",
                opacity: 0.50, color: "#fff", fontSize: 15, lineHeight: 1.5,
              }}
            >
              {draft}
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", paddingInline: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Sending
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Composer ── */}
      <div
        style={{
          padding: "10px 14px",
          paddingBottom: "max(14px, env(safe-area-inset-bottom))",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "linear-gradient(180deg, rgba(13,19,32,0.88) 0%, rgba(11,15,20,0.96) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          flexShrink: 0,
          display: "flex", gap: 10, alignItems: "flex-end",
          position: "relative", zIndex: 1,
        }}
      >
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message…"
            maxLength={2000}
            style={{
              width: "100%",
              resize: "none",
              borderRadius: 22,
              border: "1px solid rgba(255,255,255,0.11)",
              padding: "11px 50px 11px 16px",
              fontSize: 16,
              lineHeight: 1.45,
              background: "rgba(255,255,255,0.06)",
              outline: "none",
              fontFamily: "inherit",
              maxHeight: 120,
              overflowY: "auto",
              boxSizing: "border-box",
              color: "#fff",
              caretColor: "#5EA8FF",
              transition: "border-color 0.18s, background 0.18s",
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(94,168,255,0.45)";
              e.currentTarget.style.background  = "rgba(255,255,255,0.08)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.11)";
              e.currentTarget.style.background  = "rgba(255,255,255,0.06)";
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            aria-label="Send"
            style={{
              position: "absolute",
              right: 6, bottom: 6,
              width: 34, height: 34,
              borderRadius: "50%",
              border: "none",
              background: !draft.trim() || sending
                ? "rgba(255,255,255,0.09)"
                : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              boxShadow: !draft.trim() || sending
                ? "none"
                : "0 2px 8px rgba(59,130,246,0.40)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: !draft.trim() || sending ? "default" : "pointer",
              transition: "background 0.18s, box-shadow 0.18s",
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {sendError && (
        <div style={{ padding: "6px 16px 8px", fontSize: 12, color: "#f87171", background: "rgba(11,15,20,0.95)", textAlign: "center", flexShrink: 0 }}>
          {sendError}
        </div>
      )}
    </div>
  );
}

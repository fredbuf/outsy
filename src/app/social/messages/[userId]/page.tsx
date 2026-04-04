/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { MessageRow } from "@/app/api/social/messages/[userId]/route";

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric",
  });
}

// Compact date for event cards
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
  if (eventDay === today) return `Today${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow${timeStr}`;
  const monthDay = d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" });
  return `${monthDay}${timeStr}`;
}

type OtherUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

// ── Event card bubble ──────────────────────────────────────────────────────────

function EventCard({ msg, isMe }: { msg: MessageRow; isMe: boolean }) {
  const ev = msg.event;
  if (!ev) return null;
  const dateStr = smartEventDate(ev.start_at);

  return (
    <Link
      href={`/events/${ev.id}`}
      style={{ textDecoration: "none", color: "inherit", display: "block" }}
    >
      <div
        style={{
          maxWidth: 240,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border-strong)",
          background: "var(--surface-subtle)",
          cursor: "pointer",
        }}
      >
        {ev.image_url ? (
          <img
            src={ev.image_url}
            alt=""
            style={{ width: "100%", height: 110, objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: 64,
            background: isMe ? "rgba(124,58,237,0.15)" : "var(--surface-raised)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
        )}
        <div style={{ padding: "9px 11px 10px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {ev.title}
          </div>
          {dateStr && (
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 3 }}>{dateStr}</div>
          )}
          {ev.venue_name && (
            <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
              {ev.venue_name}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const params = useParams<{ userId: string }>();
  const otherId = params.userId;
  const { user, session, loading: authLoading } = useAuth();

  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // iOS Safari keyboard fix
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
        el.style.top = `${vv.offsetTop}px`;
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
        textareaRef.current?.focus();
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

      {/* ── Header bar ── */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          background: "rgba(13,11,20,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Back chevron */}
        <Link
          href="/social"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", textDecoration: "none", color: "rgba(255,255,255,0.6)", flexShrink: 0, transition: "background 0.15s" }}
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>

        {/* Avatar */}
        {otherUser && (
          <Link href={`/profile/${otherId}`} style={{ lineHeight: 0, flexShrink: 0 }}>
            {otherUser.avatar_url ? (
              <img
                src={otherUser.avatar_url}
                alt={otherName}
                style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(124,58,237,0.4)" }}
              />
            ) : (
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: getAvatarColor(otherName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none", border: "2px solid rgba(124,58,237,0.3)" }}>
                {getInitials(otherName)}
              </div>
            )}
          </Link>
        )}

        {/* Name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: "#fff" }}>{otherName}</div>
          {otherUser?.username && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>@{otherUser.username}</div>
          )}
        </div>
      </div>

      {/* ── Message thread ── */}
      <div
        style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          padding: "16px 16px 8px",
          display: "flex", flexDirection: "column", gap: 4,
          background: "transparent",
          position: "relative", zIndex: 1,
        }}
      >
        {loadingMsgs ? (
          <div style={{ margin: "auto", color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <div style={{ opacity: 0.15, marginBottom: 12, display: "flex", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", margin: 0 }}>No messages yet</p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            const isEventShare = !!msg.event_id;

            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  gap: 3,
                  marginBottom: 4,
                }}
              >
                {isEventShare ? (
                  <EventCard msg={msg} isMe={isMe} />
                ) : (
                  <div
                    style={{
                      maxWidth: "75%",
                      padding: "10px 16px",
                      borderRadius: isMe ? "20px 20px 4px 20px" : "20px 20px 20px 4px",
                      background: isMe
                        ? "#7c3aed"
                        : "rgba(255,255,255,0.08)",
                      border: isMe ? "none" : "1px solid rgba(255,255,255,0.1)",
                      boxShadow: isMe ? "0 2px 14px rgba(124,58,237,0.38)" : "none",
                      color: "#fff",
                      fontSize: 15,
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.body}
                  </div>
                )}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", paddingInline: 6 }}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}

        {/* Sending status bubble */}
        {sending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, marginBottom: 4 }}>
            <div style={{ maxWidth: "75%", padding: "10px 16px", borderRadius: "20px 20px 4px 20px", background: "#7c3aed", opacity: 0.55, color: "#fff", fontSize: 15, lineHeight: 1.45 }}>
              {draft}
            </div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.38)", paddingInline: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden style={{ animation: "spin 1s linear infinite" }}>
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
              </svg>
              Sending
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Send input ── */}
      <div
        style={{
          padding: "10px 16px",
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(13,11,20,0.80)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          flexShrink: 0,
          display: "flex", gap: 10, alignItems: "flex-end",
          position: "relative", zIndex: 1,
        }}
      >
        {/* Pill input wrapper */}
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            maxLength={2000}
            style={{
              width: "100%",
              resize: "none",
              borderRadius: 24,
              border: "1px solid rgba(255,255,255,0.12)",
              padding: "11px 52px 11px 18px",
              fontSize: 16,
              lineHeight: 1.4,
              background: "rgba(255,255,255,0.07)",
              outline: "none",
              fontFamily: "inherit",
              maxHeight: 120,
              overflowY: "auto",
              boxSizing: "border-box",
              color: "#fff",
              caretColor: "#a78bfa",
              transition: "border-color 0.15s",
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(124,58,237,0.55)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          />
          {/* Send button inside pill */}
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sending}
            style={{
              position: "absolute",
              right: 6,
              bottom: 6,
              width: 36, height: 36,
              borderRadius: "50%",
              border: "none",
              background: !draft.trim() || sending ? "rgba(255,255,255,0.1)" : "#7c3aed",
              boxShadow: !draft.trim() || sending ? "none" : "0 2px 8px rgba(124,58,237,0.45)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: !draft.trim() || sending ? "default" : "pointer",
              transition: "background 0.15s, box-shadow 0.15s",
              flexShrink: 0,
            }}
            aria-label="Send"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      {sendError && (
        <div style={{ padding: "6px 16px 8px", fontSize: 12, color: "#f87171", background: "rgba(13,11,20,0.9)", textAlign: "center" }}>
          {sendError}
        </div>
      )}
    </div>
  );
}

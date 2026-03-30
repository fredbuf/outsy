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

type OtherUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

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

  // iOS Safari keyboard fix (fallback for iOS < 17 / browsers without
  // interactive-widget:resizes-content support).
  // The Visual Viewport API fires when the virtual keyboard opens or closes.
  // We set the chat container's height and top to exactly match the visual
  // viewport so the composer is never hidden behind the keyboard.
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
          borderBottom: "1px solid var(--border)",
          background: "var(--background)",
          flexShrink: 0,
        }}
      >
        <Link href="/social" style={{ opacity: 0.55, fontSize: 14, textDecoration: "none", marginRight: 4 }}>
          ←
        </Link>
        {otherUser && (
          <Link href={`/profile/${otherId}`} style={{ lineHeight: 0, flexShrink: 0 }}>
            {otherUser.avatar_url ? (
              <img src={otherUser.avatar_url} alt={otherName} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: getAvatarColor(otherName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", userSelect: "none" }}>
                {getInitials(otherName)}
              </div>
            )}
          </Link>
        )}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{otherName}</div>
          {otherUser?.username && (
            <div style={{ fontSize: 12, opacity: 0.45 }}>@{otherUser.username}</div>
          )}
        </div>
      </div>

      {/* ── Message thread ── */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {loadingMsgs ? (
          <div style={{ margin: "auto", opacity: 0.4, fontSize: 14 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", opacity: 0.4 }}>
            <p style={{ fontSize: 14 }}>No messages yet.</p>
            <p style={{ fontSize: 13 }}>Say hello!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user.id;
            return (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isMe ? "flex-end" : "flex-start",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    maxWidth: "72%",
                    padding: "9px 14px",
                    borderRadius: isMe ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    background: isMe ? "var(--accent)" : "var(--surface-raised)",
                    color: isMe ? "#fff" : "inherit",
                    fontSize: 14,
                    lineHeight: 1.45,
                    wordBreak: "break-word",
                  }}
                >
                  {msg.body}
                </div>
                <span style={{ fontSize: 10, opacity: 0.35, paddingInline: 4 }}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Send input ── */}
      <div
        style={{
          padding: "10px 16px",
          paddingBottom: "max(10px, env(safe-area-inset-bottom))",
          borderTop: "1px solid var(--border)",
          background: "var(--background)",
          flexShrink: 0,
          display: "flex", gap: 8, alignItems: "flex-end",
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message…"
          maxLength={2000}
          style={{
            flex: 1, resize: "none", borderRadius: 20,
            border: "1px solid var(--border-strong)",
            padding: "9px 14px", fontSize: 16, lineHeight: 1.4,
            background: "var(--surface-subtle)", outline: "none",
            fontFamily: "inherit", maxHeight: 120,
            overflowY: "auto",
          }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          style={{
            width: 38, height: 38, borderRadius: "50%", border: "none",
            background: !draft.trim() || sending ? "var(--surface-raised)" : "var(--accent)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: !draft.trim() || sending ? "not-allowed" : "pointer",
            flexShrink: 0, transition: "background 0.15s",
          }}
          aria-label="Send"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>

      {sendError && (
        <div style={{ padding: "4px 16px", fontSize: 12, color: "#dc2626", background: "var(--background)" }}>
          {sendError}
        </div>
      )}
    </div>
  );
}

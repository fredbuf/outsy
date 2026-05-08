/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { OrgMessageRow } from "@/app/api/organizers/[id]/messages/route";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric",
  });
}

type UserProfile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null; custom_avatar_url?: string | null };
type OrgInfo = { id: string; name: string; slug: string | null; image_url: string | null };

// ── Component ──────────────────────────────────────────────────────────────────

export default function OrgMemberChatPage() {
  const params = useParams<{ orgId: string; userId: string }>();
  const { orgId, userId: otherUserId } = params;
  const { user, session, loading: authLoading } = useAuth();

  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [organizer, setOrganizer] = useState<OrgInfo | null>(null);
  const [messages, setMessages] = useState<OrgMessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  async function fetchMessages() {
    if (!session) return;
    const res = await fetch(`/api/organizers/${orgId}/messages/${otherUserId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 403) { setForbidden(true); setLoadingMsgs(false); return; }
    const data = await res.json() as {
      ok: boolean;
      messages?: OrgMessageRow[];
      otherUser?: UserProfile;
      organizer?: OrgInfo;
      error?: string;
    };
    if (data.ok) {
      setMessages(data.messages ?? []);
      if (data.otherUser) setOtherUser(data.otherUser);
      if (data.organizer) setOrganizer(data.organizer);
    }
    setLoadingMsgs(false);
  }

  useEffect(() => {
    if (!authLoading && session) fetchMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

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
    return () => { vv.removeEventListener("resize", adjust); vv.removeEventListener("scroll", adjust); cancelAnimationFrame(rafId); };
  }, []);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !session) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/organizers/${orgId}/messages/${otherUserId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ body }),
      });
      const data = await res.json() as { ok: boolean; message?: OrgMessageRow; error?: string };
      if (data.ok && data.message) {
        setMessages((prev) => [...prev, data.message!]);
        setDraft("");
        if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.focus(); }
      } else {
        setSendError(data.error ?? "Failed to send.");
      }
    } catch {
      setSendError("Network error.");
    } finally {
      setSending(false);
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

  if (forbidden) {
    return (
      <main style={{ maxWidth: 540, margin: "0 auto", padding: "48px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 15, opacity: 0.6 }}>You do not have access to this conversation.</p>
        <Link href="/org/inbox" style={{ color: "#5EA8FF", textDecoration: "none", fontSize: 14 }}>
          ← Back
        </Link>
      </main>
    );
  }

  const otherName = otherUser?.display_name ?? otherUser?.username ?? "User";

  function UserAvatar({ size = 40 }: { size?: number }) {
    return <GeneratedAvatar name={otherName} imageUrl={otherUser?.custom_avatar_url ?? null} size={size} style={{ flexShrink: 0 }} />;
  }

  const orgName = organizer?.name ?? "Organizer";

  return (
    <div ref={chatRef} className="chat-screen">

      {/* Header — shows the user we're talking to */}
      <div style={{
        display: "grid", gridTemplateColumns: "52px 1fr 52px", alignItems: "center",
        padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "linear-gradient(180deg, rgba(28,37,53,0.96) 0%, rgba(13,19,32,0.92) 100%)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        flexShrink: 0, position: "relative", zIndex: 1,
      }}>
        <Link href="/org/inbox" aria-label="Back" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
          textDecoration: "none", color: "rgba(255,255,255,0.70)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>

        <Link href={`/profile/${otherUserId}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, textDecoration: "none" }}>
          <UserAvatar size={40} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{otherName}</div>
            {otherUser?.username && (
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>@{otherUser.username}</div>
            )}
          </div>
        </Link>

        <div />
      </div>

      {/* Thread */}
      <div style={{
        flex: 1, minHeight: 0, overflowY: "auto", padding: "20px 16px 12px",
        display: "flex", flexDirection: "column", gap: 2,
        position: "relative", zIndex: 1,
      }}>
        {loadingMsgs ? (
          <div style={{ margin: "auto", color: "rgba(255,255,255,0.30)", fontSize: 14 }}>Loading…</div>
        ) : messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", margin: 0 }}>No messages yet</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            // Org member's POV: org messages are "from me", user messages are "from them"
            const isMe = msg.sender_organizer_id === orgId;
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showSeparator = !prevMsg
              || (prevMsg.sender_organizer_id === orgId) !== isMe
              || (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) > 3 * 60 * 1000;
            const isDeleted = !!msg.deleted_at;

            return (
              <div key={msg.id} style={{
                display: "flex", flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
                gap: 2, marginTop: showSeparator ? 10 : 2,
              }}>
                {/* Org sender label (right side) */}
                {isMe && showSeparator && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", paddingInline: 4, fontWeight: 600 }}>
                    {orgName}
                  </div>
                )}
                <div style={{
                  maxWidth: "72%", padding: "10px 15px",
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
                  color: "#fff", fontSize: 15, lineHeight: 1.5, wordBreak: "break-word",
                }}>
                  {isDeleted
                    ? <span style={{ opacity: 0.35, fontStyle: "italic", fontSize: 14 }}>Message deleted</span>
                    : msg.body}
                </div>
                {showSeparator && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", paddingInline: 4, marginTop: 1 }}>
                    {formatTime(msg.created_at)}
                  </span>
                )}
              </div>
            );
          })
        )}

        {sending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, marginTop: 10 }}>
            <div style={{
              maxWidth: "72%", padding: "10px 15px", borderRadius: "18px 18px 5px 18px",
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              opacity: 0.5, color: "#fff", fontSize: 15, lineHeight: 1.5,
            }}>{draft}</div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer — labelled as sending "as [org name]" */}
      <div style={{
        padding: "10px 14px", paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(13,19,32,0.88) 0%, rgba(11,15,20,0.96) 100%)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 6,
        position: "relative", zIndex: 1,
      }}>
        <div style={{ fontSize: 10, opacity: 0.35, textAlign: "right", letterSpacing: "0.05em" }}>
          Replying as {orgName}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Reply…"
              maxLength={2000}
              style={{
                width: "100%", resize: "none", borderRadius: 22,
                border: "1px solid rgba(255,255,255,0.11)", padding: "11px 50px 11px 16px",
                fontSize: 16, lineHeight: 1.45, background: "rgba(255,255,255,0.06)",
                outline: "none", fontFamily: "inherit", maxHeight: 120,
                overflowY: "auto", boxSizing: "border-box", color: "#fff", caretColor: "#5EA8FF",
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
              aria-label="Send"
              style={{
                position: "absolute", right: 6, bottom: 6,
                width: 34, height: 34, borderRadius: "50%", border: "none",
                background: !draft.trim() || sending
                  ? "rgba(255,255,255,0.09)"
                  : "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                cursor: !draft.trim() || sending ? "default" : "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
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

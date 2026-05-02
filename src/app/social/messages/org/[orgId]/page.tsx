/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { OrgMessageRow } from "@/app/api/organizers/[id]/messages/route";

// ── Helpers ────────────────────────────────────────────────────────────────────

const LOGO_COLORS = ["#1e3a5f", "#2d4a1e", "#4a1e2d", "#1e2d4a", "#3a2d1e", "#1e4a3a"];

function getLogoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
    month: "short", day: "numeric",
  });
}

type OrgInfo = { id: string; name: string; slug: string | null; image_url: string | null };

// ── Component ──────────────────────────────────────────────────────────────────

export default function UserOrgChatPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const { user, session, loading: authLoading } = useAuth();

  const [organizer, setOrganizer] = useState<OrgInfo | null>(null);
  const [messages, setMessages] = useState<OrgMessageRow[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  async function fetchMessages() {
    if (!session) return;
    const res = await fetch(`/api/organizers/${orgId}/messages/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const data = await res.json() as {
      ok: boolean; messages?: OrgMessageRow[]; organizer?: OrgInfo; error?: string;
    };
    if (data.ok) {
      setMessages(data.messages ?? []);
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
      const res = await fetch(`/api/organizers/${orgId}/messages/me`, {
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

  const orgName = organizer?.name ?? "Organizer";

  function OrgLogo({ size = 28 }: { size?: number }) {
    const r = Math.round(size * 0.25);
    if (organizer?.image_url) {
      return (
        <img src={organizer.image_url} alt={orgName}
          style={{ width: size, height: size, borderRadius: r, objectFit: "cover", flexShrink: 0 }} />
      );
    }
    return (
      <div style={{
        width: size, height: size, borderRadius: r,
        background: getLogoColor(orgName),
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.35), fontWeight: 800,
        color: "rgba(255,255,255,0.85)", userSelect: "none", flexShrink: 0,
      }}>
        {getInitials(orgName)}
      </div>
    );
  }

  return (
    <div ref={chatRef} className="chat-screen">

      {/* Header */}
      <div style={{
        display: "grid", gridTemplateColumns: "52px 1fr 52px", alignItems: "center",
        padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "linear-gradient(180deg, rgba(28,37,53,0.96) 0%, rgba(13,19,32,0.92) 100%)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        flexShrink: 0, position: "relative", zIndex: 1,
      }}>
        <Link href="/social?tab=messages" aria-label="Back" style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)",
          textDecoration: "none", color: "rgba(255,255,255,0.70)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </Link>

        {/* Org identity block */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
          <OrgLogo size={40} />
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.2 }}>{orgName}</div>
        </div>

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
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", marginTop: 4 }}>
              Send a message to {orgName}
            </p>
          </div>
        ) : (
          messages.map((msg, i) => {
            // User's own messages: sender_organizer_id is null
            const isMe = !msg.sender_organizer_id;
            const prevMsg = i > 0 ? messages[i - 1] : null;
            const showSeparator = !prevMsg
              || (!!prevMsg.sender_organizer_id) !== (!!msg.sender_organizer_id)
              || (new Date(msg.created_at).getTime() - new Date(prevMsg.created_at).getTime()) > 3 * 60 * 1000;
            const isDeleted = !!msg.deleted_at;

            return (
              <div key={msg.id} style={{
                display: "flex", flexDirection: "column",
                alignItems: isMe ? "flex-end" : "flex-start",
                gap: 2, marginTop: showSeparator ? 10 : 2,
              }}>
                {/* Org sender label */}
                {!isMe && showSeparator && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <OrgLogo size={18} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>
                      {orgName}
                    </span>
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

      {/* Composer */}
      <div style={{
        padding: "10px 14px", paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(13,19,32,0.88) 0%, rgba(11,15,20,0.96) 100%)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        flexShrink: 0, display: "flex", gap: 10, alignItems: "flex-end",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`Message ${orgName}…`}
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

      {sendError && (
        <div style={{ padding: "6px 16px 8px", fontSize: 12, color: "#f87171", background: "rgba(11,15,20,0.95)", textAlign: "center", flexShrink: 0 }}>
          {sendError}
        </div>
      )}
    </div>
  );
}

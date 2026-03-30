/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import type { ActivityItem } from "@/app/api/social/activity/route";
import type { ConversationPreview } from "@/app/api/social/conversations/route";

// ── Avatar helpers ─────────────────────────────────────────────────────────────

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

// ── Time helpers ───────────────────────────────────────────────────────────────

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

// ── Small avatar circle ────────────────────────────────────────────────────────

function AvatarCircle({
  avatarUrl,
  name,
  size = 40,
}: {
  avatarUrl: string | null;
  name: string | null;
  size?: number;
}) {
  return avatarUrl ? (
    <img
      src={avatarUrl}
      alt={name ?? ""}
      style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
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

// ── Activity tab ───────────────────────────────────────────────────────────────

type RequestRowState = "idle" | "accepting" | "ignoring" | "accepted" | "ignored";

function FriendRequestReceivedRow({
  item,
  token,
}: {
  item: ActivityItem;
  token: string;
}) {
  const [state, setState] = useState<RequestRowState>(
    item.friendshipPending ? "idle" : "accepted"
  );

  async function respond(action: "accept" | "ignore") {
    if (!item.entity_id) return;
    setState(action === "accept" ? "accepting" : "ignoring");
    try {
      const res = await fetch("/api/social/activity/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friendshipId: item.entity_id, action }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setState(action === "accept" ? "accepted" : "ignored");
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  const name = item.actor.display_name ?? item.actor.username ?? "Someone";

  if (state === "accepted") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
        <Link href={`/profile/${item.actor.id}`} style={{ flexShrink: 0, lineHeight: 0 }}>
          <AvatarCircle avatarUrl={item.actor.avatar_url} name={name} />
        </Link>
        <div style={{ flex: 1, fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{name}</span> and you are now friends.
        </div>
        <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, flexShrink: 0 }}>Friends ✓</span>
      </div>
    );
  }

  if (state === "ignored") {
    return null;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <Link href={`/profile/${item.actor.id}`} style={{ flexShrink: 0, lineHeight: 0 }}>
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={name} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{name}</span> wants to be friends.
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{relativeTime(item.created_at)}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={state !== "idle"}
          style={{
            padding: "6px 14px", borderRadius: 16, border: "none",
            background: state !== "idle" ? "var(--surface-raised)" : "var(--accent)",
            color: "#fff", fontWeight: 600, fontSize: 13,
            cursor: state !== "idle" ? "not-allowed" : "pointer",
            opacity: state !== "idle" ? 0.5 : 1,
          }}
        >
          {state === "accepting" ? "…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => respond("ignore")}
          disabled={state !== "idle"}
          style={{
            padding: "6px 14px", borderRadius: 16,
            border: "1px solid var(--border-strong)", background: "transparent",
            fontWeight: 600, fontSize: 13, cursor: state !== "idle" ? "not-allowed" : "pointer",
            opacity: state !== "idle" ? 0.5 : 1, color: "inherit",
          }}
        >
          {state === "ignoring" ? "…" : "Ignore"}
        </button>
      </div>
    </div>
  );
}

function FriendRequestAcceptedRow({ item }: { item: ActivityItem }) {
  const name = item.actor.display_name ?? item.actor.username ?? "Someone";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <Link href={`/profile/${item.actor.id}`} style={{ flexShrink: 0, lineHeight: 0 }}>
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={name} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14 }}>
          <span style={{ fontWeight: 600 }}>{name}</span> accepted your friend request.
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{relativeTime(item.created_at)}</div>
      </div>
      <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, flexShrink: 0 }}>Friends ✓</span>
    </div>
  );
}

function ActivityTab({ token }: { token: string }) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/social/activity", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; items?: ActivityItem[] }) => {
        if (d.ok) {
          setItems(d.items ?? []);
          // Mark all notifications as read (fire-and-forget)
          fetch("/api/notifications/mark-read", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div style={{ padding: "32px 0", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>;
  }

  if (!items || items.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ opacity: 0.2, marginBottom: 12, display: "flex", justifyContent: "center" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No activity yet</p>
        <p style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>Friend requests and updates will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      {items.map((item) => {
        if (item.type === "friend_request_received") {
          return <FriendRequestReceivedRow key={item.id} item={item} token={token} />;
        }
        if (item.type === "friend_request_accepted") {
          return <FriendRequestAcceptedRow key={item.id} item={item} />;
        }
        return null;
      })}
    </div>
  );
}

// ── Messages tab ───────────────────────────────────────────────────────────────

function ConversationRow({ conv }: { conv: ConversationPreview }) {
  const name = conv.display_name ?? conv.username ?? "Unknown";
  const preview = (conv.lastMessage.isFromMe ? "You: " : "") + conv.lastMessage.body;
  const clipped = preview.length > 48 ? preview.slice(0, 48) + "…" : preview;

  return (
    <Link
      href={`/social/messages/${conv.userId}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 0", borderBottom: "1px solid var(--border)", cursor: "pointer",
        }}
      >
        <AvatarCircle avatarUrl={conv.avatar_url} name={name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 13, opacity: 0.5, marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
            {clipped}
          </div>
        </div>
        <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>
          {relativeTime(conv.lastMessage.created_at)}
        </span>
      </div>
    </Link>
  );
}

function MessagesTab({ token }: { token: string }) {
  const [convs, setConvs] = useState<ConversationPreview[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/social/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; conversations?: ConversationPreview[] }) => {
        if (d.ok) setConvs(d.conversations ?? []);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return <div style={{ padding: "32px 0", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>;
  }

  if (!convs || convs.length === 0) {
    return (
      <div style={{ padding: "48px 24px", textAlign: "center" }}>
        <div style={{ opacity: 0.2, marginBottom: 12, display: "flex", justifyContent: "center" }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No messages yet</p>
        <p style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>
          Message a friend from their{" "}
          <Link href="/friends/add" style={{ color: "var(--accent)", textDecoration: "none" }}>profile</Link>.
        </p>
      </div>
    );
  }

  return (
    <div>
      {convs.map((c) => (
        <ConversationRow key={c.userId} conv={c} />
      ))}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "activity" | "messages";

export default function SocialPage() {
  const { user, session, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("activity");

  if (loading) return null;

  if (!user || !session) {
    return (
      <main style={{ maxWidth: 540, margin: "0 auto", padding: "48px 16px", textAlign: "center" }}>
        <p style={{ fontSize: 15, opacity: 0.6 }}>Sign in to see your activity and messages.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
          style={{
            marginTop: 16, padding: "9px 24px", borderRadius: 20,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  return (
    <main
      className="page-main"
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 56px" }}
    >
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Social</h1>

      {/* Segmented tabs */}
      <div
        style={{
          display: "flex", gap: 0,
          background: "var(--surface-subtle)",
          borderRadius: 12, padding: 3,
          marginBottom: 20,
        }}
      >
        {(["activity", "messages"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9,
              border: "none", fontWeight: 600, fontSize: 14,
              cursor: "pointer",
              background: tab === t ? "var(--background)" : "transparent",
              color: "inherit",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              transition: "background 0.15s",
              textTransform: "capitalize",
            }}
          >
            {t === "activity" ? "Activity" : "Messages"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "activity" && <ActivityTab token={session.access_token} />}
      {tab === "messages" && <MessagesTab token={session.access_token} />}
    </main>
  );
}

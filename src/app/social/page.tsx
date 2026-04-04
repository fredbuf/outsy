/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import type { ActivityItem, MomentMeta } from "@/app/api/social/activity/route";
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
  onRead,
}: {
  item: ActivityItem;
  token: string;
  onRead: () => void;
}) {
  const [state, setState] = useState<RequestRowState>(
    item.friendshipPending ? "idle" : "accepted"
  );

  async function respond(action: "accept" | "ignore") {
    if (!item.entity_id) return;
    setState(action === "accept" ? "accepting" : "ignoring");
    onRead();
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

function EventInviteRow({ item, onRead }: { item: ActivityItem; onRead: () => void }) {
  const actorName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const eventTitle = item.event?.title ?? "an event";
  const eventId = item.entity_id;

  // Event image thumbnail with inviter avatar overlay
  const thumbnail = (
    <div style={{ position: "relative", flexShrink: 0, width: 52, height: 52 }}>
      {item.event?.image_url ? (
        <img
          src={item.event.image_url}
          alt=""
          style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", display: "block" }}
        />
      ) : (
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={actorName} size={52} />
      )}
      {/* Inviter avatar overlaid at bottom-right — only when event image is present */}
      {item.event?.image_url && (
        <div
          style={{
            position: "absolute", bottom: -3, right: -3,
            borderRadius: "50%",
            border: "2px solid var(--background)",
            lineHeight: 0, flexShrink: 0,
          }}
        >
          <AvatarCircle avatarUrl={item.actor.avatar_url} name={actorName} size={20} />
        </div>
      )}
    </div>
  );

  const inner = (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", paddingLeft: 2,
        borderBottom: "1px solid var(--border)",
        cursor: eventId ? "pointer" : "default",
      }}
      onClick={onRead}
    >
      {thumbnail}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14, fontWeight: 600,
          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
        }}>
          {eventTitle}
        </div>
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
          {actorName} invited you · {relativeTime(item.created_at)}
        </div>
      </div>
    </div>
  );

  if (!eventId) return inner;
  return (
    <Link href={`/events/${eventId}`} style={{ textDecoration: "none", color: "inherit" }}>
      {inner}
    </Link>
  );
}

function FriendRequestAcceptedRow({ item, onRead }: { item: ActivityItem; onRead: () => void }) {
  const name = item.actor.display_name ?? item.actor.username ?? "Someone";
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
      onClick={onRead}
    >
      <Link href={`/profile/${item.actor.id}`} style={{ flexShrink: 0, lineHeight: 0 }} onClick={(e) => e.stopPropagation()}>
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

function MomentPostedRow({
  item,
  onRead,
}: {
  item: ActivityItem & { momentMeta: MomentMeta };
  onRead: () => void;
}) {
  const actorName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const { event_id, event_title } = item.momentMeta;
  const momentId = item.entity_id;
  const href = momentId
    ? `/events/${event_id}/moments?moment=${momentId}`
    : `/events/${event_id}/moments`;

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }} onClick={onRead}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 0", borderBottom: "1px solid var(--border)",
          cursor: "pointer",
        }}
      >
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={actorName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
          }}>
            <span style={{ fontWeight: 600 }}>{actorName}</span>
            {" posted a Moment"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>
            {event_title} · {relativeTime(item.created_at)}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3, flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </Link>
  );
}

function ActivityTab({
  token,
  onUnreadChange,
}: {
  token: string;
  onUnreadChange: (hasUnread: boolean) => void;
}) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/social/activity", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; items?: ActivityItem[] }) => {
        if (d.ok) setItems(d.items ?? []);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Report unread state upward whenever items or localRead change
  useEffect(() => {
    if (items == null) return;
    const hasUnread = items.some((i) => !i.read && !localRead.has(i.id));
    onUnreadChange(hasUnread);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, localRead]);

  function markRead(id: string) {
    setLocalRead((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }

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
          return (
            <FriendRequestReceivedRow
              key={item.id}
              item={item}
              token={token}
              onRead={() => markRead(item.id)}
            />
          );
        }
        if (item.type === "friend_request_accepted") {
          return (
            <FriendRequestAcceptedRow
              key={item.id}
              item={item}
              onRead={() => markRead(item.id)}
            />
          );
        }
        if (item.type === "event_invite") {
          return (
            <EventInviteRow
              key={item.id}
              item={item}
              onRead={() => markRead(item.id)}
            />
          );
        }
        if (item.type === "moment_posted" && item.momentMeta) {
          return (
            <MomentPostedRow
              key={item.id}
              item={item as ActivityItem & { momentMeta: MomentMeta }}
              onRead={() => markRead(item.id)}
            />
          );
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
  // Unread proxy: last message is from the other person
  const isUnread = !conv.lastMessage.isFromMe;

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
          <div style={{ fontSize: 15, fontWeight: isUnread ? 700 : 600, lineHeight: 1.2 }}>{name}</div>
          <div style={{
            fontSize: 13, marginTop: 2,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            opacity: isUnread ? 0.8 : 0.5,
            fontWeight: isUnread ? 500 : 400,
          }}>
            {clipped}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5, flexShrink: 0 }}>
          <span style={{ fontSize: 12, opacity: 0.4 }}>
            {relativeTime(conv.lastMessage.created_at)}
          </span>
          {isUnread && (
            <span
              aria-hidden
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: "var(--accent)",
              }}
            />
          )}
        </div>
      </div>
    </Link>
  );
}

function MessagesTab({
  token,
  onUnreadChange,
}: {
  token: string;
  onUnreadChange: (hasUnread: boolean) => void;
}) {
  const [convs, setConvs] = useState<ConversationPreview[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/social/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; conversations?: ConversationPreview[] }) => {
        if (d.ok) {
          const list = d.conversations ?? [];
          setConvs(list);
          onUnreadChange(list.some((c) => !c.lastMessage.isFromMe));
        }
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

// ── Unread dot ─────────────────────────────────────────────────────────────────

function UnreadDot() {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: 7, height: 7, borderRadius: "50%",
        background: "var(--accent)",
        marginLeft: 5,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "activity" | "messages";

export default function SocialPage() {
  const { user, session, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("activity");
  const [activityUnread, setActivityUnread] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState(false);

  useEffect(() => {
    document.body.classList.add("is-aurora-page");
    return () => { document.body.classList.remove("is-aurora-page"); };
  }, []);

  function handleTabSwitch(t: Tab) {
    setTab(t);
    // Clear the messages dot when the user opens that tab (no server-side read tracking for messages)
    if (t === "messages") setMessagesUnread(false);
  }

  if (loading) return null;

  if (!user || !session) {
    return (
      <main className="app-page" style={{ maxWidth: 540, margin: "0 auto", padding: "48px 16px", textAlign: "center", minHeight: "100dvh" }}>
        <div className="page-top-glow" aria-hidden="true" />
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
      className="page-main app-page"
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 56px", minHeight: "100dvh" }}
    >
      <div className="page-top-glow" aria-hidden="true" />
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20, textAlign: "center" }}>Inbox</h1>

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
            onClick={() => handleTabSwitch(t)}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 9,
              border: "none", fontWeight: 600, fontSize: 14,
              cursor: "pointer",
              background: tab === t ? "var(--background)" : "transparent",
              color: "inherit",
              boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.10)" : "none",
              transition: "background 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {t === "activity" ? "Activity" : "Messages"}
            {t === "activity" && activityUnread && tab !== "activity" && <UnreadDot />}
            {t === "messages" && messagesUnread && tab !== "messages" && <UnreadDot />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "activity" && (
        <ActivityTab
          token={session.access_token}
          onUnreadChange={setActivityUnread}
        />
      )}
      {tab === "messages" && (
        <MessagesTab
          token={session.access_token}
          onUnreadChange={(v) => {
            // Only set unread when not already on messages tab
            if (tab !== "messages") setMessagesUnread(v);
          }}
        />
      )}
    </main>
  );
}

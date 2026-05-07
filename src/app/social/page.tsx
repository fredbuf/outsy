/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useBottomNav } from "@/app/components/BottomNavContext";
import type { ActivityItem, MomentMeta } from "@/app/api/social/activity/route";
import type { ConversationPreview } from "@/app/api/social/conversations/route";
import type { UserSearchResult } from "@/app/api/users/search/route";

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
            fontSize: 14, lineHeight: 1.35,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            <span style={{ fontWeight: 600 }}>{actorName}</span>
            {" posted a new moment in "}
            <span style={{ fontWeight: 600 }}>{event_title}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>
            {relativeTime(item.created_at)}
          </div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3, flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </Link>
  );
}

function MomentCommentRow({
  item,
  onRead,
}: {
  item: ActivityItem & { momentMeta: MomentMeta };
  onRead: () => void;
}) {
  const actorName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const { event_id, event_title } = item.momentMeta;
  // entity_id is the moment id; link opens the moment directly
  const momentId = item.entity_id;
  const href = momentId
    ? `/events/${event_id}/moments?moment=${momentId}`
    : `/events/${event_id}/moments`;

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }} onClick={onRead}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", borderBottom: "1px solid var(--border)", cursor: "pointer",
      }}>
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={actorName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, lineHeight: 1.35,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            <span style={{ fontWeight: 600 }}>{actorName}</span>
            {" commented on your moment in "}
            <span style={{ fontWeight: 600 }}>{event_title}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>{relativeTime(item.created_at)}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3, flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </Link>
  );
}

function RsvpReceivedRow({
  item,
  onRead,
}: {
  item: ActivityItem;
  onRead: () => void;
}) {
  const actorName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const eventTitle = item.event?.title ?? "your event";
  const eventId = item.entity_id;
  const href = eventId ? `/events/${eventId}` : "/schedule";
  const responseLabel =
    item.rsvpResponse === "going" ? "is going"
    : item.rsvpResponse === "maybe" ? "is interested"
    : item.rsvpResponse === "cant_go" ? "can't go"
    : "responded";

  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }} onClick={onRead}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", borderBottom: "1px solid var(--border)", cursor: "pointer",
      }}>
        <AvatarCircle avatarUrl={item.actor.avatar_url} name={actorName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, lineHeight: 1.35,
            overflow: "hidden", display: "-webkit-box",
            WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>
            <span style={{ fontWeight: 600 }}>{actorName}</span>
            {` ${responseLabel} to `}
            <span style={{ fontWeight: 600 }}>{eventTitle}</span>
          </div>
          <div style={{ fontSize: 12, opacity: 0.5, marginTop: 3 }}>{relativeTime(item.created_at)}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3, flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </Link>
  );
}

function CohostInviteRow({
  item,
  token,
  onRead,
}: {
  item: ActivityItem;
  token: string;
  onRead: () => void;
}) {
  const [status, setStatus] = useState<"pending" | "accepting" | "declining" | "accepted" | "declined">(
    item.cohostInviteStatus === "accepted"
      ? "accepted"
      : item.cohostInviteStatus === "declined"
      ? "declined"
      : "pending"
  );

  const hostName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const eventTitle = item.event?.title ?? "an event";
  const eventId = item.entity_id;

  async function respond(action: "accept" | "decline") {
    if (!eventId) return;
    setStatus(action === "accept" ? "accepting" : "declining");
    onRead();
    try {
      const res = await fetch(`/api/events/${eventId}/cohost-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationId: item.id, action }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setStatus(action === "accept" ? "accepted" : "declined");
      } else {
        setStatus("pending");
      }
    } catch {
      setStatus("pending");
    }
  }

  if (status === "declined") return null;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Avatar + optional event thumbnail */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        {item.event?.image_url ? (
          <img
            src={item.event.image_url}
            alt=""
            style={{ width: 44, height: 44, borderRadius: 10, objectFit: "cover", display: "block" }}
          />
        ) : (
          <AvatarCircle avatarUrl={item.actor.avatar_url} name={hostName} size={44} />
        )}
        {item.event?.image_url && (
          <div style={{
            position: "absolute", bottom: -3, right: -3,
            borderRadius: "50%", border: "2px solid var(--background)", lineHeight: 0,
          }}>
            <AvatarCircle avatarUrl={item.actor.avatar_url} name={hostName} size={18} />
          </div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600 }}>{hostName}</span>
          {" invited you to co-host "}
          {eventId ? (
            <Link href={`/events/${eventId}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "underline" }}>
              {eventTitle}
            </Link>
          ) : (
            <span style={{ fontWeight: 600 }}>{eventTitle}</span>
          )}
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{relativeTime(item.created_at)}</div>
      </div>

      {status === "accepted" ? (
        <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, flexShrink: 0 }}>Co-host ✓</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void respond("accept")}
            disabled={status === "accepting" || status === "declining"}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "none",
              background: status === "accepting" ? "rgba(124,58,237,0.45)" : "var(--accent, #7c3aed)",
              color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}
          >
            {status === "accepting" ? "…" : "Accept"}
          </button>
          <button
            type="button"
            onClick={() => void respond("decline")}
            disabled={status === "accepting" || status === "declining"}
            style={{
              padding: "6px 14px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent", color: "rgba(255,255,255,0.60)",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}
          >
            {status === "declining" ? "…" : "Decline"}
          </button>
        </div>
      )}
    </div>
  );
}

function OrgMemberInviteRow({
  item,
  token,
  onRead,
}: {
  item: ActivityItem;
  token: string;
  onRead: () => void;
}) {
  const invite = item.orgMemberInvite;
  if (!invite) return null;

  const [status, setStatus] = useState<"pending" | "accepting" | "declining" | "accepted" | "declined">(
    invite.status === "accepted" ? "accepted"
    : invite.status === "declined" ? "declined"
    : "pending",
  );

  const inviterName = item.actor.display_name ?? item.actor.username ?? "Someone";
  const orgId = item.entity_id;

  async function respond(action: "accept" | "decline") {
    if (!orgId) return;
    setStatus(action === "accept" ? "accepting" : "declining");
    onRead();
    try {
      const res = await fetch(`/api/organizers/${orgId}/members/respond`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setStatus(action === "accept" ? "accepted" : "declined");
      } else {
        setStatus("pending");
      }
    } catch {
      setStatus("pending");
    }
  }

  if (status === "declined") return null;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 0", borderBottom: "1px solid var(--border)",
      }}
    >
      <AvatarCircle avatarUrl={item.actor.avatar_url} name={inviterName} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.3 }}>
          <span style={{ fontWeight: 600 }}>{inviterName}</span>
          {" invited you to join "}
          {invite.organizerSlug ? (
            <Link href={`/o/${invite.organizerSlug}`} style={{ fontWeight: 600, color: "inherit", textDecoration: "underline" }}>
              {invite.organizerName}
            </Link>
          ) : (
            <span style={{ fontWeight: 600 }}>{invite.organizerName}</span>
          )}
          {" as "}
          <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{invite.role}</span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{relativeTime(item.created_at)}</div>
      </div>

      {status === "accepted" ? (
        <span style={{ fontSize: 12, color: "#10b981", fontWeight: 600, flexShrink: 0 }}>Joined ✓</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => void respond("accept")}
            disabled={status === "accepting" || status === "declining"}
            style={{
              padding: "6px 14px", borderRadius: 20, border: "none",
              background: status === "accepting" ? "rgba(94,168,255,0.35)" : "rgba(94,168,255,0.18)",
              color: "#5EA8FF", fontSize: 12, fontWeight: 700,
              cursor: status === "accepting" || status === "declining" ? "not-allowed" : "pointer",
            }}
          >
            {status === "accepting" ? "…" : "Accept"}
          </button>
          <button
            type="button"
            onClick={() => void respond("decline")}
            disabled={status === "accepting" || status === "declining"}
            style={{
              padding: "6px 14px", borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent", color: "rgba(255,255,255,0.60)",
              fontSize: 12, fontWeight: 600,
              cursor: status === "accepting" || status === "declining" ? "not-allowed" : "pointer",
            }}
          >
            {status === "declining" ? "…" : "Decline"}
          </button>
        </div>
      )}
    </div>
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
    setItems(null);
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
        const isUnread = !item.read && !localRead.has(item.id);

        let row: React.ReactNode = null;
        if (item.type === "friend_request_received") {
          row = (
            <FriendRequestReceivedRow
              item={item}
              token={token}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "friend_request_accepted") {
          row = (
            <FriendRequestAcceptedRow
              item={item}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "event_invite") {
          row = (
            <EventInviteRow
              item={item}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "moment_posted" && item.momentMeta) {
          row = (
            <MomentPostedRow
              item={item as ActivityItem & { momentMeta: MomentMeta }}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "moment_comment" && item.momentMeta) {
          row = (
            <MomentCommentRow
              item={item as ActivityItem & { momentMeta: MomentMeta }}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "rsvp_received") {
          row = (
            <RsvpReceivedRow
              item={item}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "cohost_invite") {
          row = (
            <CohostInviteRow
              item={item}
              token={token}
              onRead={() => markRead(item.id)}
            />
          );
        } else if (item.type === "organizer_member_invite" && item.orgMemberInvite) {
          row = (
            <OrgMemberInviteRow
              item={item}
              token={token}
              onRead={() => markRead(item.id)}
            />
          );
        }

        if (!row) return null;

        return (
          <div
            key={item.id}
            style={{
              borderLeft: isUnread
                ? "2px solid rgba(124,58,237,0.65)"
                : "2px solid transparent",
              paddingLeft: 10,
              transition: "border-color 0.25s",
            }}
          >
            {row}
          </div>
        );
      })}
    </div>
  );
}

// ── Messages tab ───────────────────────────────────────────────────────────────

const LOGO_COLORS = ["#1e3a5f", "#2d4a1e", "#4a1e2d", "#1e2d4a", "#3a2d1e", "#1e4a3a"];
function getLogoColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}

function OrgConversationRow({ conv }: { conv: ConversationPreview }) {
  const orgName = conv.orgName ?? "Organizer";
  const isUnread = conv.lastMessage.isUnread;
  const preview = (conv.lastMessage.isFromMe ? "You: " : `${orgName}: `) + conv.lastMessage.body;
  const clipped = preview.length > 48 ? preview.slice(0, 48) + "…" : preview;
  const r = Math.round(44 * 0.22);

  return (
    <Link href={`/social/messages/org/${conv.orgId}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 14px", marginBottom: 6, borderRadius: 16,
        border: isUnread ? "1px solid rgba(94,168,255,0.25)" : "1px solid rgba(255,255,255,0.06)",
        background: isUnread ? "rgba(94,168,255,0.07)" : "rgba(255,255,255,0.04)",
        cursor: "pointer",
      }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          {conv.orgImageUrl ? (
            <img src={conv.orgImageUrl} alt={orgName} style={{ width: 44, height: 44, borderRadius: r, objectFit: "cover" }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: r, background: getLogoColor(orgName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.85)", userSelect: "none" }}>
              {getInitials(orgName)}
            </div>
          )}
          {isUnread && (
            <span aria-hidden style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#5EA8FF", border: "2px solid #0d0b14" }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: isUnread ? 700 : 600, lineHeight: 1.2 }}>{orgName}</div>
          <div style={{ fontSize: 13, marginTop: 3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", opacity: isUnread ? 0.75 : 0.4, fontWeight: isUnread ? 500 : 400 }}>{clipped}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, opacity: 0.35 }}>{relativeTime(conv.lastMessage.created_at)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.2 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}

function ConversationRow({ conv }: { conv: ConversationPreview }) {
  const name = conv.display_name ?? conv.username ?? "Unknown";
  const preview = (conv.lastMessage.isFromMe ? "You: " : "") + conv.lastMessage.body;
  const clipped = preview.length > 48 ? preview.slice(0, 48) + "…" : preview;
  const isUnread = conv.lastMessage.isUnread;

  return (
    <Link
      href={`/social/messages/${conv.userId}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 14px",
          marginBottom: 6,
          borderRadius: 16,
          border: isUnread ? "1px solid rgba(124,58,237,0.25)" : "1px solid rgba(255,255,255,0.06)",
          background: isUnread ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.04)",
          cursor: "pointer",
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        {/* Avatar with unread ring */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <AvatarCircle avatarUrl={conv.avatar_url} name={name} size={44} />
          {isUnread && (
            <span
              aria-hidden
              style={{
                position: "absolute", bottom: 1, right: 1,
                width: 10, height: 10, borderRadius: "50%",
                background: "#7c3aed",
                border: "2px solid #0d0b14",
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: isUnread ? 700 : 600, lineHeight: 1.2 }}>{name}</div>
          <div style={{
            fontSize: 13, marginTop: 3,
            overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            opacity: isUnread ? 0.75 : 0.4,
            fontWeight: isUnread ? 500 : 400,
          }}>
            {clipped}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, opacity: 0.35 }}>
            {relativeTime(conv.lastMessage.created_at)}
          </span>
          {/* Arrow hint */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.2 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
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
    setLoading(true);
    setConvs(null);
    fetch("/api/social/conversations", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; conversations?: ConversationPreview[] }) => {
        if (d.ok) {
          const list = d.conversations ?? [];
          setConvs(list);
          onUnreadChange(list.some((c) => c.lastMessage.isUnread));
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
      {convs.map((c) =>
        c.orgId
          ? <OrgConversationRow key={c.orgId} conv={c} />
          : <ConversationRow key={c.userId} conv={c} />
      )}
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

// ── Add-friend sheet ───────────────────────────────────────────────────────────

type ButtonState = "idle" | "sending" | "sent" | "cancelling" | "friends";

function initialButtonState(result: UserSearchResult): ButtonState {
  if (!result.friendship) return "idle";
  if (result.friendship.status === "accepted") return "friends";
  if (result.friendship.direction === "sent") return "sent";
  return "idle";
}

function AddFriendButton({
  state,
  onAdd,
  onCancel,
}: {
  state: ButtonState;
  onAdd: () => void;
  onCancel: () => void;
}) {
  if (state === "friends") {
    return (
      <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Friends
      </span>
    );
  }
  if (state === "sent" || state === "cancelling") {
    return (
      <button
        type="button"
        onClick={onCancel}
        disabled={state === "cancelling"}
        style={{
          padding: "7px 14px", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.08)",
          fontWeight: 600, fontSize: 13,
          cursor: state === "cancelling" ? "not-allowed" : "pointer",
          flexShrink: 0, color: "rgba(255,255,255,0.70)",
          opacity: state === "cancelling" ? 0.5 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {state === "cancelling" ? "…" : "Sent"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={state === "sending"}
      style={{
        padding: "7px 14px", borderRadius: 20,
        border: "1px solid rgba(94,168,255,0.30)",
        background: state === "sending" ? "rgba(94,168,255,0.10)" : "rgba(94,168,255,0.18)",
        color: "#5EA8FF", fontWeight: 600, fontSize: 13,
        cursor: state === "sending" ? "not-allowed" : "pointer",
        flexShrink: 0, opacity: state === "sending" ? 0.5 : 1,
        transition: "opacity 0.15s",
      }}
    >
      {state === "sending" ? "…" : "Add"}
    </button>
  );
}

function AddFriendSheet({ open, onClose, token }: { open: boolean; onClose: () => void; token: string }) {
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [buttonStates, setButtonStates] = useState<Record<string, ButtonState>>({});
  const [friendshipIds, setFriendshipIds] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Defer focus so the browser never scrolls the underlying page to reveal
  // the input. autoFocus fires before position:fixed is fully established,
  // causing a scroll-to-bottom jump. A short timeout avoids that.
  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(id);
  }, []);

  function startClose() {
    setClosing(true);
    setTimeout(() => { onClose(); }, 250);
  }

  // Debounce + fetch combined: all setState calls happen inside async callbacks,
  // never synchronously in the effect body (satisfies react-hooks/set-state-in-effect).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      setSearching(true);
      fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data: { ok: boolean; results?: UserSearchResult[] }) => {
          if (data.ok && data.results) {
            setResults(data.results);
            const initial: Record<string, ButtonState> = {};
            const ids: Record<string, string> = {};
            for (const r of data.results) {
              initial[r.id] = initialButtonState(r);
              if (r.friendship?.id) ids[r.id] = r.friendship.id;
            }
            setButtonStates(initial);
            setFriendshipIds(ids);
          }
        })
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  // State reset on close is handled by the `key` prop on the parent — React remounts
  // this component fresh each time the sheet opens, no explicit reset effect needed.
  }, [query, token]);

  async function handleAdd(result: UserSearchResult) {
    setButtonStates((prev) => ({ ...prev, [result.id]: "sending" }));
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId: result.id }),
      });
      const data = (await res.json()) as { ok: boolean; friendshipStatus?: string; friendshipId?: string };
      if (data.ok) {
        const next: ButtonState = data.friendshipStatus === "friends" ? "friends" : "sent";
        setButtonStates((prev) => ({ ...prev, [result.id]: next }));
        if (data.friendshipId) setFriendshipIds((prev) => ({ ...prev, [result.id]: data.friendshipId! }));
      } else {
        setButtonStates((prev) => ({ ...prev, [result.id]: "idle" }));
      }
    } catch {
      setButtonStates((prev) => ({ ...prev, [result.id]: "idle" }));
    }
  }

  async function handleCancel(userId: string) {
    const friendshipId = friendshipIds[userId];
    if (!friendshipId) return;
    setButtonStates((prev) => ({ ...prev, [userId]: "cancelling" }));
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ friendshipId }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setButtonStates((prev) => ({ ...prev, [userId]: "idle" }));
        setFriendshipIds((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      } else {
        setButtonStates((prev) => ({ ...prev, [userId]: "sent" }));
      }
    } catch {
      setButtonStates((prev) => ({ ...prev, [userId]: "sent" }));
    }
  }

  if (!open) return null;

  const trimmed = query.trim();
  // Gate result display on query length so stale results don't flash when input is cleared.
  const showResults = trimmed.length >= 2 && results !== null && results.length > 0;
  const showEmpty   = trimmed.length >= 2 && results !== null && results.length === 0 && !searching;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={(e) => e.target === e.currentTarget && startClose()}
    >
      <div
        className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
        style={{
          width: "100%",
          maxHeight: "92vh",
          background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
          borderRadius: "22px 22px 0 0",
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
          <button
            type="button"
            onClick={startClose}
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
          <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>
            Add friend
          </div>
          <div />
        </div>

        {/* Search bar */}
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
              ref={inputRef}
              placeholder="Search by name or username…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1, background: "none", border: "none", outline: "none",
                fontSize: 16, color: "#fff", fontFamily: "inherit",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
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

        {/* Results — scrollable */}
        <div style={{
          flex: 1, overflowY: "auto", minHeight: 0,
          padding: "8px 8px 0",
          paddingBottom: "max(32px, env(safe-area-inset-bottom))",
        }}>
          {searching && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", padding: "8px 4px", margin: 0 }}>Searching…</p>
          )}

          {showResults && results!.map((result) => {
            const label = result.display_name ?? result.username ?? "Unknown";
            const btnState = buttonStates[result.id] ?? "idle";
            return (
              <div
                key={result.id}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "10px 12px",
                  background: "none", border: "1px solid transparent",
                  borderRadius: 14, marginBottom: 4, boxSizing: "border-box",
                }}
              >
                <Link href={`/profile/${result.id}`} style={{ flexShrink: 0, lineHeight: 0 }} onClick={startClose}>
                  <AvatarCircle avatarUrl={result.avatar_url} name={label} size={40} />
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/profile/${result.id}`} style={{ textDecoration: "none", color: "inherit" }} onClick={startClose}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", color: "#fff" }}>{label}</div>
                    {result.username && result.display_name && (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>@{result.username}</div>
                    )}
                  </Link>
                </div>
                <AddFriendButton
                  state={btnState}
                  onAdd={() => handleAdd(result)}
                  onCancel={() => handleCancel(result.id)}
                />
              </div>
            );
          })}

          {showEmpty && (
            <div style={{ padding: "40px 0", textAlign: "center", opacity: 0.45 }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 10px" }}>
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>No users found</p>
            </div>
          )}

          {!searching && trimmed.length > 0 && trimmed.length < 2 && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", padding: "8px 4px", margin: 0 }}>Keep typing…</p>
          )}

          {!trimmed && (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", textAlign: "center", padding: "32px 0 0", margin: 0 }}>
              Search by name or @username
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "activity" | "messages";

export default function SocialPage() {
  const { user, session, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "activity";
    return new URLSearchParams(window.location.search).get("tab") === "messages"
      ? "messages"
      : "activity";
  });
  const [activityUnread, setActivityUnread] = useState(false);
  const [messagesUnread, setMessagesUnread] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const { hide: hideNav, show: showNav } = useBottomNav();

  // Lock body scroll and hide bottom nav when the add-friend sheet is open
  useEffect(() => {
    document.body.style.overflow = addFriendOpen ? "hidden" : "";
    if (addFriendOpen) { hideNav(); } else { showNav(); }
    return () => {
      document.body.style.overflow = "";
      showNav();
    };
  }, [addFriendOpen, hideNav, showNav]);

  function handleTabSwitch(t: Tab) {
    setTab(t);
    const url = t === "activity" ? "/social" : `/social?tab=${t}`;
    router.replace(url);
  }

  if (loading) return null;

  if (!user || !session) {
    return (
      <main className="app-page" style={{ maxWidth: 540, margin: "0 auto", padding: "48px 16px", textAlign: "center", minHeight: "100dvh", border: "1.5px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)" }}>
        <div className="app-bg-gradient" aria-hidden="true" />
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
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 56px", minHeight: "100dvh", border: "1.5px solid rgba(255,255,255,0.10)", boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      {/* Header — left-aligned title + add-friend button */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Inbox</h1>
        <button
          type="button"
          onClick={() => setAddFriendOpen(true)}
          aria-label="Add friend"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 13px", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.07)",
            color: "inherit", cursor: "pointer",
            fontSize: 13, fontWeight: 600,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
          Add friend
        </button>
      </div>

      {/* Segmented tabs */}
      <div
        style={{
          position: "relative",
          display: "flex",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 9999,
          overflow: "hidden",       /* clips pill to capsule shape on outer edges */
          marginBottom: 20,
        }}
      >
        {/* Full-segment sliding background — own borderRadius rounds inner edge */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: "50%",
            borderRadius: 9999,
            background: "linear-gradient(135deg, rgba(94,168,255,0.20) 0%, rgba(37,99,235,0.26) 100%)",
            boxShadow: "0 1px 8px rgba(37,99,235,0.12)",
            transform: tab === "activity" ? "translateX(0)" : "translateX(100%)",
            transition: "transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "none",
          }}
        />
        {(["activity", "messages"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTabSwitch(t)}
            style={{
              flex: 1,
              position: "relative",
              zIndex: 2,
              padding: "10px 0",
              border: "none",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              background: "transparent",
              color: tab === t ? "#ffffff" : "rgba(255,255,255,0.45)",
              transition: "color 0.2s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
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
          onUnreadChange={setMessagesUnread}
        />
      )}

      {/* Add-friend sheet — key remounts fresh state on each open/close cycle */}
      <AddFriendSheet
        key={String(addFriendOpen)}
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        token={session.access_token}
      />
    </main>
  );
}

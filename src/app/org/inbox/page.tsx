/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";
import type { OrgConversationPreview } from "@/app/api/organizers/[id]/messages/route";
import type { ActivityItem } from "@/app/api/social/activity/route";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string) {
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

type Tab = "messages" | "activity";

// ── Messages list ──────────────────────────────────────────────────────────────

function ConversationRow({ conv, orgId }: { conv: OrgConversationPreview; orgId: string }) {
  const name = conv.display_name ?? conv.username ?? "Unknown";
  const preview = (conv.lastMessage.isFromOrg ? "You: " : "") + conv.lastMessage.body;
  const clipped = preview.length > 52 ? preview.slice(0, 52) + "…" : preview;
  const isUnread = conv.lastMessage.isUnread;

  return (
    <Link href={`/social/messages/org/${orgId}/${conv.userId}`} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 6,
        borderRadius: 16,
        border: isUnread ? "1px solid rgba(94,168,255,0.25)" : "1px solid rgba(255,255,255,0.06)",
        background: isUnread ? "rgba(94,168,255,0.07)" : "rgba(255,255,255,0.04)",
      }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <GeneratedAvatar name={name} imageUrl={conv.custom_avatar_url ?? null} size={44} />
          {isUnread && <span aria-hidden style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, borderRadius: "50%", background: "#5EA8FF", border: "2px solid #0d0b14" }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: isUnread ? 700 : 600 }}>{name}</div>
          <div style={{ fontSize: 13, marginTop: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", opacity: isUnread ? 0.75 : 0.4, fontWeight: isUnread ? 500 : 400 }}>{clipped}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, opacity: 0.35 }}>{relativeTime(conv.lastMessage.created_at)}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.2 }}><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    </Link>
  );
}

// ── Activity list ──────────────────────────────────────────────────────────────

function ActivityRow({ item }: { item: ActivityItem }) {
  const actorName = item.actor.display_name ?? item.actor.username ?? "Someone";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <GeneratedAvatar name={actorName} imageUrl={item.actor.custom_avatar_url ?? null} size={40} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, lineHeight: 1.4 }}>
          <span style={{ fontWeight: 600 }}>{actorName}</span>{" "}
          <span style={{ opacity: 0.7 }}>{item.type.replace(/_/g, " ")}</span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.4, marginTop: 2 }}>{relativeTime(item.created_at)}</div>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrgInboxPage() {
  const { session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();

  const [tab, setTab] = useState<Tab>("messages");
  const [convs, setConvs] = useState<OrgConversationPreview[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  const orgId = activeOrganizer?.organizerId;

  useEffect(() => {
    if (!session || !orgId) return;
    setLoadingConvs(true);
    fetch(`/api/organizers/${orgId}/messages`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; conversations?: OrgConversationPreview[] }) => {
        if (d.ok) setConvs(d.conversations ?? []);
      })
      .finally(() => setLoadingConvs(false));
  }, [session?.access_token, orgId]);

  useEffect(() => {
    if (!session || !orgId) return;
    setLoadingActivity(true);
    fetch(`/api/social/activity?orgId=${orgId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; items?: ActivityItem[] }) => {
        if (d.ok) setActivity(d.items ?? []);
      })
      .finally(() => setLoadingActivity(false));
  }, [session?.access_token, orgId]);

  const unreadMessages = (convs ?? []).some((c) => c.lastMessage.isUnread);
  const unreadActivity = (activity ?? []).some((a) => !a.read);

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 80px", minHeight: "100dvh" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 20px" }}>Inbox</h1>

      {/* Segmented control */}
      <div style={{ position: "relative", display: "flex", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", borderRadius: 9999, overflow: "hidden", marginBottom: 20 }}>
        <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "50%", borderRadius: 9999, background: "linear-gradient(135deg, rgba(94,168,255,0.20) 0%, rgba(37,99,235,0.26) 100%)", transform: tab === "messages" ? "translateX(0)" : "translateX(100%)", transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)", pointerEvents: "none" }} />
        {(["messages", "activity"] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{ flex: 1, position: "relative", zIndex: 2, padding: "10px 0", border: "none", fontWeight: 600, fontSize: 14, cursor: "pointer", background: "transparent", color: tab === t ? "#ffffff" : "rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {t === "messages" ? "Messages" : "Activity"}
            {t === "messages" && unreadMessages && tab !== "messages" && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#5EA8FF" }} />}
            {t === "activity" && unreadActivity && tab !== "activity" && <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />}
          </button>
        ))}
      </div>

      {/* Messages tab */}
      {tab === "messages" && (
        loadingConvs ? (
          <div style={{ padding: "32px 0", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>
        ) : !convs || convs.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No messages yet</p>
            <p style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>Messages from your audience will appear here.</p>
          </div>
        ) : (
          <div>{convs.map((c) => <ConversationRow key={c.userId} conv={c} orgId={orgId!} />)}</div>
        )
      )}

      {/* Activity tab */}
      {tab === "activity" && (
        loadingActivity ? (
          <div style={{ padding: "32px 0", textAlign: "center", opacity: 0.4, fontSize: 14 }}>Loading…</div>
        ) : !activity || activity.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.6, margin: 0 }}>No organizer activity yet</p>
            <p style={{ fontSize: 13, opacity: 0.4, marginTop: 4 }}>Notifications for this organizer will appear here.</p>
          </div>
        ) : (
          <div>{activity.map((item) => <ActivityRow key={item.id} item={item} />)}</div>
        )
      )}
    </main>
  );
}

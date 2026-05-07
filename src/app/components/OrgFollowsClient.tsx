/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useBottomNav } from "./BottomNavContext";

// ── Types ──────────────────────────────────────────────────────────────────────

type UserFollower = {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type OrgEntry = {
  id: string;
  name: string;
  slug: string | null;
  image_url: string | null;
  type: string | null;
};

export type OrgEventItem = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
};

// ── Colour helpers ─────────────────────────────────────────────────────────────

const LOGO_COLORS = ["#1e3a5f", "#2d4a1e", "#4a1e2d", "#1e2d4a", "#3a2d1e", "#1e4a3a"];
const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];

function getLogoColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function getAvatarColor(name: string | null) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function getInitials(name: string | null) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── DetailSheet ────────────────────────────────────────────────────────────────

function DetailSheet({
  title,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder,
  children,
}: {
  title: string;
  onClose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  const [closing, setClosing] = useState(false);

  function close() {
    setClosing(true);
    setTimeout(() => onClose(), 260);
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && close()}
      style={{
        position: "fixed", inset: 0,
        background: closing ? "rgba(0,0,0,0)" : "rgba(0,0,0,0.55)",
        zIndex: 300,
        display: "flex", alignItems: "flex-end",
        transition: "background 0.22s ease",
      }}
    >
      <div
        className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
        style={{
          background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: "24px 24px 0 0",
          width: "100%",
          height: "88dvh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 2px", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "8px 16px 10px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={close}
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
          <div style={{ textAlign: "center", fontSize: 17, fontWeight: 600, color: "#FFFFFF" }}>{title}</div>
          <div />
        </div>

        {/* Search */}
        <div style={{ padding: "0 16px 10px", flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.13)",
            borderRadius: 14, padding: "0 14px", height: 50,
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="detail-sheet-search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, color: "#FFFFFF" }}
            />
          </div>
        </div>

        {/* Scrollable list */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 16px max(24px, env(safe-area-inset-bottom))" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Row components ─────────────────────────────────────────────────────────────

function UserRow({ user, onClose }: { user: UserFollower; onClose: () => void }) {
  return (
    <Link
      href={user.username ? `/u/${user.username}` : "#"}
      onClick={onClose}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 2px", textDecoration: "none", color: "inherit",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: getAvatarColor(user.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
          {getInitials(user.display_name)}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {user.display_name ?? "User"}
        </div>
        {user.username && (
          <div style={{ fontSize: 12, opacity: 0.45, marginTop: 1 }}>@{user.username}</div>
        )}
      </div>
    </Link>
  );
}

function OrgRow({ org, onClose }: { org: OrgEntry; onClose: () => void }) {
  return (
    <Link
      href={org.slug ? `/o/${org.slug}` : "#"}
      onClick={onClose}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 2px", textDecoration: "none", color: "inherit",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {org.image_url ? (
        <img src={org.image_url} alt={org.name} style={{ width: 40, height: 40, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 9, background: getLogoColor(org.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
          {getInitials(org.name)}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {org.name}
        </div>
        {org.slug && (
          <div style={{ fontSize: 12, opacity: 0.45, marginTop: 1 }}>@{org.slug}</div>
        )}
      </div>
    </Link>
  );
}

function EventRow({ event, onClose }: { event: OrgEventItem; onClose: () => void }) {
  return (
    <Link
      href={`/events/${event.id}`}
      onClick={onClose}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 2px", textDecoration: "none", color: "inherit",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div style={{ width: 44, height: 36, borderRadius: 8, overflow: "hidden", background: "var(--surface-raised)", flexShrink: 0 }}>
        {event.image_url && (
          <img src={event.image_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {event.title}
        </div>
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{formatDate(event.start_at)}</div>
      </div>
    </Link>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OrgFollowsClient({
  organizerId,
  followerCount,
  orgFollowingCount,
  eventCount,
  events = [],
}: {
  organizerId: string;
  followerCount: number;
  orgFollowingCount: number;
  eventCount: number;
  /** Pre-fetched events from the server. When provided the Events sheet uses them directly. */
  events?: OrgEventItem[];
}) {
  const { hide: hideNav, show: showNav } = useBottomNav();
  const [activeSheet, setActiveSheet] = useState<"followers" | "following" | "events" | null>(null);
  const [search, setSearch] = useState("");
  const [followersUsers, setFollowersUsers] = useState<UserFollower[] | null>(null);
  const [followersOrgs, setFollowersOrgs] = useState<OrgEntry[] | null>(null);
  const [followingOrgs, setFollowingOrgs] = useState<OrgEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Hide/show bottom nav while any sheet is open.
  useEffect(() => {
    if (activeSheet) {
      hideNav();
    } else {
      showNav();
    }
    return () => { showNav(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheet]);

  function openSheet(sheet: "followers" | "following" | "events") {
    setSearch("");
    setActiveSheet(sheet);

    if (sheet === "followers" && followersUsers === null) {
      setLoading(true);
      fetch(`/api/organizers/${organizerId}/followers`)
        .then((r) => r.json())
        .then((d: { ok: boolean; users?: UserFollower[]; orgs?: OrgEntry[] }) => {
          if (d.ok) {
            setFollowersUsers(d.users ?? []);
            setFollowersOrgs(d.orgs ?? []);
          }
        })
        .catch(() => { setFollowersUsers([]); setFollowersOrgs([]); })
        .finally(() => setLoading(false));
    }

    if (sheet === "following" && followingOrgs === null) {
      setLoading(true);
      fetch(`/api/organizers/${organizerId}/following`)
        .then((r) => r.json())
        .then((d: { ok: boolean; orgs?: OrgEntry[] }) => {
          if (d.ok) setFollowingOrgs(d.orgs ?? []);
        })
        .catch(() => setFollowingOrgs([]))
        .finally(() => setLoading(false));
    }
    // Events are passed in as props — no fetch needed.
  }

  function closeSheet() {
    setActiveSheet(null);
    setSearch("");
  }

  return (
    <>
      {/* Stats pill */}
      <div style={{
        display: "flex", width: "100%", maxWidth: 300,
        borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)",
      }}>
        <button
          type="button"
          onClick={() => openSheet("followers")}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{followerCount}</span>
          <span style={{ fontSize: 11, opacity: 0.45, marginTop: 2, fontWeight: 500 }}>Followers</span>
        </button>
        <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
        <button
          type="button"
          onClick={() => openSheet("following")}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{orgFollowingCount}</span>
          <span style={{ fontSize: 11, opacity: 0.45, marginTop: 2, fontWeight: 500 }}>Following</span>
        </button>
        <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
        <button
          type="button"
          onClick={() => openSheet("events")}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{eventCount}</span>
          <span style={{ fontSize: 11, opacity: 0.45, marginTop: 2, fontWeight: 500 }}>Events</span>
        </button>
      </div>

      {/* Followers sheet */}
      {activeSheet === "followers" && (
        <DetailSheet
          title={`Followers · ${followerCount}`}
          onClose={closeSheet}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search followers…"
        >
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", opacity: 0.45 }}>Loading…</div>
          ) : followersUsers === null ? null : (() => {
            const q = search.toLowerCase();
            const filteredUsers = followersUsers.filter(
              (u) => !q || (u.display_name ?? "").toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q),
            );
            const filteredOrgs = (followersOrgs ?? []).filter(
              (o) => !q || o.name.toLowerCase().includes(q) || (o.slug ?? "").toLowerCase().includes(q),
            );
            const total = followersUsers.length + (followersOrgs?.length ?? 0);

            if (total === 0) {
              return (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>No followers yet.</p>
                </div>
              );
            }
            if (filteredUsers.length + filteredOrgs.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No results for &ldquo;{search}&rdquo;</p>;
            }
            return (
              <div>
                {filteredOrgs.length > 0 && (
                  <>
                    {filteredUsers.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", margin: "4px 0 6px" }}>
                        Organizers
                      </div>
                    )}
                    {filteredOrgs.map((o) => <OrgRow key={o.id} org={o} onClose={closeSheet} />)}
                  </>
                )}
                {filteredUsers.length > 0 && (
                  <>
                    {filteredOrgs.length > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", margin: "12px 0 6px" }}>
                        People
                      </div>
                    )}
                    {filteredUsers.map((u) => <UserRow key={u.id} user={u} onClose={closeSheet} />)}
                  </>
                )}
              </div>
            );
          })()}
        </DetailSheet>
      )}

      {/* Following sheet */}
      {activeSheet === "following" && (
        <DetailSheet
          title={`Following · ${orgFollowingCount}`}
          onClose={closeSheet}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search following…"
        >
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px 0", opacity: 0.45 }}>Loading…</div>
          ) : followingOrgs === null ? null : (() => {
            const q = search.toLowerCase();
            const filtered = followingOrgs.filter(
              (o) => !q || o.name.toLowerCase().includes(q) || (o.slug ?? "").toLowerCase().includes(q),
            );
            if (followingOrgs.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>Not following any organizers yet.</p>
                </div>
              );
            }
            if (filtered.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No results for &ldquo;{search}&rdquo;</p>;
            }
            return (
              <div>
                {filtered.map((o) => <OrgRow key={o.id} org={o} onClose={closeSheet} />)}
              </div>
            );
          })()}
        </DetailSheet>
      )}

      {/* Events sheet */}
      {activeSheet === "events" && (
        <DetailSheet
          title={`Events · ${eventCount}`}
          onClose={closeSheet}
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search events…"
        >
          {(() => {
            const q = search.toLowerCase();
            const filtered = events.filter((e) => !q || e.title.toLowerCase().includes(q));

            if (events.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>No events yet.</p>
                </div>
              );
            }
            if (filtered.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No results for &ldquo;{search}&rdquo;</p>;
            }
            return (
              <div>
                {filtered.map((e) => <EventRow key={e.id} event={e} onClose={closeSheet} />)}
              </div>
            );
          })()}
        </DetailSheet>
      )}
    </>
  );
}

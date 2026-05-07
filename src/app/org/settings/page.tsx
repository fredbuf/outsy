/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Colour helpers ─────────────────────────────────────────────────────────────

const LOGO_COLORS = ["#1e3a5f", "#2d4a1e", "#4a1e2d", "#1e2d4a", "#3a2d1e", "#1e4a3a"];
const AVATAR_COLORS = ["#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"];

function logoColor(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function avatarColor(name: string | null) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string | null) {
  if (!name) return "?";
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

// ── Types ──────────────────────────────────────────────────────────────────────

type Member = {
  userId: string;
  role: string;
  status: string; // "active" | "pending"
  joinedAt: string;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;
};

// ── Role pill ──────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  owner:   { bg: "rgba(234,179,8,0.15)",   color: "#eab308" },
  admin:   { bg: "rgba(94,168,255,0.15)",  color: "#5EA8FF" },
  editor:  { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" },
  pending: { bg: "rgba(251,146,60,0.15)",  color: "#fb923c" },
};

function RolePill({ role }: { role: string }) {
  const style = ROLE_COLORS[role] ?? ROLE_COLORS.editor;
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em",
        padding: "3px 8px", borderRadius: 20,
        background: style.bg, color: style.color,
        flexShrink: 0,
      }}
    >
      {role}
    </span>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ── Member row ─────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  isOwner,
  isSelf,
  ownerCount,
  onRemove,
  removing,
}: {
  member: Member;
  isOwner: boolean;
  isSelf: boolean;
  ownerCount: number;
  onRemove: (member: Member) => void;
  removing: string | null;
}) {
  const displayName = member.displayName ?? member.username ?? "Unknown user";
  const isPending = member.status === "pending";
  // Pending invites can always be canceled; active last-owner cannot be removed.
  const canRemove = isOwner && !isSelf && (isPending || !(member.role === "owner" && ownerCount <= 1));
  const isRemoving = removing === member.userId;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Avatar */}
      {member.avatarUrl ? (
        <img
          src={member.avatarUrl}
          alt=""
          style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }}
        />
      ) : (
        <div
          style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: avatarColor(displayName),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none",
          }}
        >
          {initials(displayName)}
        </div>
      )}

      {/* Name + handle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
          {displayName}
          {isSelf && <span style={{ fontSize: 11, opacity: 0.4, marginLeft: 6, fontWeight: 500 }}>you</span>}
        </div>
        {member.username && (
          <div style={{ fontSize: 12, opacity: 0.4, marginTop: 1 }}>@{member.username}</div>
        )}
      </div>

      {isPending ? (
        <RolePill role="pending" />
      ) : (
        <RolePill role={member.role} />
      )}

      {/* Remove/cancel button — owners only, not self, not last active owner */}
      {canRemove && (
        <button
          type="button"
          onClick={() => onRemove(member)}
          disabled={isRemoving}
          aria-label={isPending ? `Cancel invite for ${displayName}` : `Remove ${displayName}`}
          style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            border: "1px solid rgba(239,68,68,0.25)",
            background: "rgba(239,68,68,0.08)",
            color: "#ef4444",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: isRemoving ? "not-allowed" : "pointer",
            opacity: isRemoving ? 0.5 : 1,
          }}
        >
          {isRemoving ? (
            <span style={{ fontSize: 12 }}>…</span>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

// ── Confirm remove/cancel sheet ────────────────────────────────────────────────

function ConfirmSheet({
  member,
  onConfirm,
  onCancel,
}: {
  member: Member;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const displayName = member.displayName ?? member.username ?? "Unknown user";
  const isPending = member.status === "pending";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="filter-sheet-enter"
        style={{
          width: "100%",
          background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
          borderRadius: "22px 22px 0 0",
        }}
      >
        {/* Grab handle */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
        </div>

        <div
          style={{
            padding: "20px 20px",
            paddingBottom: "max(28px, env(safe-area-inset-bottom))",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px", letterSpacing: "-0.01em" }}>
            {isPending ? "Cancel invite?" : "Remove member?"}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.6, margin: "0 0 24px", lineHeight: 1.5 }}>
            {isPending
              ? `${displayName} will no longer be able to join unless invited again.`
              : `${displayName} will lose access to this organizer.`}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                width: "100%", padding: "14px", borderRadius: 14, border: "none",
                background: "rgba(239,68,68,0.15)", color: "#ef4444",
                fontWeight: 700, fontSize: 15, cursor: "pointer",
              }}
            >
              {isPending ? "Cancel invite" : "Remove"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                width: "100%", padding: "14px", borderRadius: 14,
                border: "1px solid var(--border-strong)", background: "transparent",
                color: "inherit", fontWeight: 600, fontSize: 15, cursor: "pointer",
              }}
            >
              Keep
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Invite form ────────────────────────────────────────────────────────────────

function InviteForm({
  orgId,
  token,
  onInvited,
}: {
  orgId: string;
  token: string;
  onInvited: (member: Member) => void;
}) {
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("admin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/organizers/${orgId}/members`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ identifier, role }),
      });
      const json = await res.json();
      if (json?.ok) {
        onInvited(json.member as Member);
        setIdentifier("");
        setSuccess(true);
        setTimeout(() => { setSuccess(false); setOpen(false); }, 1800);
      } else {
        setError(json?.error ?? "Failed to invite member.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "11px 14px",
          borderRadius: 12, border: "1px dashed rgba(94,168,255,0.30)",
          background: "rgba(94,168,255,0.05)",
          color: "#5EA8FF", fontSize: 13, fontWeight: 600,
          cursor: "pointer", marginTop: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add member
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      style={{
        marginTop: 6, padding: "14px",
        borderRadius: 12,
        border: "1px solid rgba(94,168,255,0.25)",
        background: "rgba(94,168,255,0.05)",
        display: "flex", flexDirection: "column", gap: 10,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#5EA8FF", opacity: 0.85 }}>Add member</div>

      <input
        type="text"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        placeholder="name@email.com or @handle"
        required
        autoComplete="off"
        autoCapitalize="none"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "10px 12px", borderRadius: 10,
          border: "1px solid var(--border-strong)",
          background: "var(--surface-raised)",
          color: "var(--foreground)", fontSize: 14,
          fontFamily: "inherit", outline: "none",
        }}
      />

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "editor")}
          style={{
            flex: 1, padding: "10px 12px", borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-raised)",
            color: "var(--foreground)", fontSize: 14,
            fontFamily: "inherit", outline: "none", cursor: "pointer",
          }}
        >
          <option value="admin">Admin</option>
          <option value="editor">Editor</option>
        </select>

        <button
          type="submit"
          disabled={loading || success || !identifier.trim()}
          style={{
            padding: "10px 20px", borderRadius: 10, border: "none",
            background: success ? "rgba(74,222,128,0.15)" : "rgba(94,168,255,0.18)",
            color: success ? "#4ade80" : "#5EA8FF",
            fontWeight: 700, fontSize: 14,
            cursor: loading || !identifier.trim() ? "not-allowed" : "pointer",
            flexShrink: 0,
          }}
        >
          {success ? "Invited ✓" : loading ? "…" : "Invite"}
        </button>

        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setIdentifier(""); }}
          style={{
            padding: "10px 12px", borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "transparent",
            color: "inherit", fontSize: 14,
            cursor: "pointer", opacity: 0.5,
          }}
        >
          Cancel
        </button>
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "#f87171", margin: 0 }}>{error}</p>
      )}
    </form>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const { user, session } = useAuth();
  const { activeOrganizer, setActiveOrganizer, orgPages } = useActiveOrganizer();
  const router = useRouter();

  const [members, setMembers] = useState<Member[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Member | null>(null);

  const userMeta = user?.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
  const personalName = userMeta?.full_name ?? user?.email?.split("@")[0] ?? "You";
  const personalAvatar = userMeta?.avatar_url ?? null;

  const isOwner = activeOrganizer?.role === "owner";
  const activeMembers = members.filter((m) => m.status === "active");
  const ownerCount = activeMembers.filter((m) => m.role === "owner").length;

  const loadMembers = useCallback(async () => {
    if (!activeOrganizer || !session?.access_token) return;
    if (!["owner", "admin"].includes(activeOrganizer.role)) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(`/api/organizers/${activeOrganizer.organizerId}/members`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json?.ok) setMembers(json.members ?? []);
      else setMembersError(json?.error ?? "Failed to load members.");
    } catch {
      setMembersError("Network error.");
    } finally {
      setMembersLoading(false);
    }
  }, [activeOrganizer?.organizerId, session?.access_token]);

  useEffect(() => { void loadMembers(); }, [loadMembers]);

  async function handleRemove(userId: string) {
    if (!session?.access_token || !activeOrganizer) return;
    setRemoving(userId);
    try {
      const res = await fetch(`/api/organizers/${activeOrganizer.organizerId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (json?.ok) {
        setMembers((prev) => prev.filter((m) => m.userId !== userId));
      } else {
        alert(json?.error ?? "Failed to remove member.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setRemoving(null);
    }
  }

  if (!activeOrganizer) return null;

  const { organizerId, name, image_url, slug } = activeOrganizer;
  const showMembers = ["owner", "admin"].includes(activeOrganizer.role);

  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 540, margin: "0 auto",
        padding: "24px 16px 80px",
        minHeight: "100dvh",
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
        <Link
          href="/org"
          aria-label="Back"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-strong)",
            color: "inherit", textDecoration: "none", flexShrink: 0,
          }}
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Settings</h1>
      </div>

      {/* ── Profile section ── */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Profile</SectionLabel>
        <div
          style={{
            borderRadius: 16,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-raised)",
            overflow: "hidden",
          }}
        >
          {/* Identity card */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            {image_url ? (
              <img src={image_url} alt={name} style={{ width: 44, height: 44, borderRadius: 11, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, background: logoColor(name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.85)", userSelect: "none" }}>
                {initials(name)}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{name}</div>
              <div style={{ fontSize: 12, opacity: 0.4, marginTop: 1, textTransform: "capitalize" }}>{activeOrganizer.type}</div>
            </div>
            {slug && (
              <Link
                href={`/o/${slug}`}
                style={{ fontSize: 12, color: "#5EA8FF", textDecoration: "none", opacity: 0.8, flexShrink: 0 }}
              >
                View →
              </Link>
            )}
          </div>

          {/* Profile action rows */}
          <Link
            href={`/dashboard/organizers/${organizerId}/edit`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Edit profile</div>
              <div style={{ fontSize: 12, opacity: 0.4, marginTop: 1 }}>Name, bio, social links</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>

          <Link
            href={`/dashboard/organizers/${organizerId}/edit`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--border)" }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 9h1v1H4c-1.5 0-3-1.69-3-3.5S2.55 3 4 3h4c1.45 0 3 1.69 3 3.5 0 1.41-.91 2.72-2 3.25V8.59c.58-.45 1-1.27 1-2.09C10 5.22 8.98 4 8 4H4c-.98 0-2 1.22-2 2.5S3 9 4 9zm9-3h-1v1h1c1 0 2 1.22 2 2.5S13.98 12 13 12H9c-.98 0-2-1.22-2-2.5 0-.83.42-1.64 1-2.09V6.25c-1.09.53-2 1.84-2 3.25C6 11.31 7.55 13 9 13h4c1.45 0 3-1.69 3-3.5S14.5 6 13 6z"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Change handle</div>
              <div style={{ fontSize: 12, opacity: 0.4, marginTop: 1 }}>Your @username · 30-day cooldown</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>

          <Link
            href={`/dashboard/organizers/${organizerId}/edit`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Change photo</div>
              <div style={{ fontSize: 12, opacity: 0.4, marginTop: 1 }}>Profile image</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        </div>
      </section>

      {/* ── Members section ── */}
      {showMembers && (
        <section style={{ marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
            <SectionLabel>Members</SectionLabel>
            {!membersLoading && activeMembers.length > 0 && (
              <span style={{ fontSize: 11, opacity: 0.4, fontWeight: 600 }}>{activeMembers.length}</span>
            )}
          </div>

          <div
            style={{
              borderRadius: 16,
              border: "1px solid var(--border-strong)",
              background: "var(--surface-raised)",
              overflow: "hidden",
            }}
          >
            {membersLoading ? (
              <div style={{ padding: "18px 16px" }}>
                {[1, 2].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 38, borderRadius: 10, background: "rgba(255,255,255,0.06)", marginBottom: i < 2 ? 10 : 0 }} />
                ))}
              </div>
            ) : membersError ? (
              <div style={{ padding: "16px", fontSize: 13, color: "#f87171", opacity: 0.8 }}>
                {membersError}
                <button
                  type="button"
                  onClick={() => void loadMembers()}
                  style={{ marginLeft: 8, fontSize: 12, color: "#5EA8FF", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                >
                  Retry
                </button>
              </div>
            ) : members.length === 0 ? (
              <div style={{ padding: "16px", fontSize: 13, opacity: 0.45 }}>No members found.</div>
            ) : (
              members.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  isOwner={isOwner}
                  isSelf={m.userId === user?.id}
                  ownerCount={ownerCount}
                  onRemove={setConfirmTarget}
                  removing={removing}
                />
              ))
            )}
          </div>

          {/* Invite form — owners only */}
          {isOwner && session?.access_token && (
            <InviteForm
              orgId={organizerId}
              token={session.access_token}
              onInvited={(member) => setMembers((prev) => [...prev, member])}
            />
          )}
        </section>
      )}

      {/* ── Switch identity ── */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Switch to</SectionLabel>

        {/* Personal */}
        <button
          type="button"
          onClick={() => { setActiveOrganizer(null); router.push("/profile"); }}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", marginBottom: 6, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-raised)", cursor: "pointer", color: "inherit", textAlign: "left" }}
        >
          {personalAvatar ? (
            <img src={personalAvatar} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }} />
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: avatarColor(personalName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", userSelect: "none" }}>
              {initials(personalName)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{personalName}</div>
            <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1 }}>Personal account</div>
          </div>
        </button>

        {/* Other orgs */}
        {orgPages
          .filter((o) => o.organizerId !== organizerId)
          .map((org) => (
            <button
              key={org.organizerId}
              type="button"
              onClick={() => { setActiveOrganizer(org); router.push(org.slug ? `/o/${org.slug}` : "/org"); }}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 14px", marginBottom: 6, borderRadius: 14, border: "1px solid var(--border-strong)", background: "var(--surface-raised)", cursor: "pointer", color: "inherit", textAlign: "left" }}
            >
              {org.image_url ? (
                <img src={org.image_url} alt={org.name} style={{ width: 38, height: 38, borderRadius: 9, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }} />
              ) : (
                <div style={{ width: 38, height: 38, borderRadius: 9, flexShrink: 0, background: logoColor(org.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.85)", userSelect: "none" }}>
                  {initials(org.name)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{org.name}</div>
                <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1, textTransform: "capitalize" }}>{org.type}</div>
              </div>
            </button>
          ))}
      </section>

      {/* ── Sign out ── */}
      <button
        type="button"
        onClick={async () => { await supabaseBrowser().auth.signOut(); router.push("/"); }}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(239,68,68,0.20)", background: "rgba(239,68,68,0.06)", cursor: "pointer", color: "#ef4444", fontWeight: 600, fontSize: 14 }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Sign out
      </button>

      {/* ── Confirm remove / cancel invite ── */}
      {confirmTarget && (
        <ConfirmSheet
          member={confirmTarget}
          onConfirm={() => {
            const target = confirmTarget;
            setConfirmTarget(null);
            void handleRemove(target.userId);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </main>
  );
}

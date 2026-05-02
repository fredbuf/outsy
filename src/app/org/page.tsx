/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";

const LOGO_COLORS = ["#1e3a5f", "#2d4a1e", "#4a1e2d", "#1e2d4a", "#3a2d1e", "#1e4a3a"];
const AVATAR_COLORS = ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];

function getLogoColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return LOGO_COLORS[h % LOGO_COLORS.length];
}
function getAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function getInitials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const QUICK_LINKS = [
  { href: "/org/events",   label: "Events",   desc: "Manage your events" },
  { href: "/org/calendar", label: "Calendar", desc: "See what's coming up" },
  { href: "/org/inbox",    label: "Inbox",    desc: "Messages & activity" },
  { href: "/org/settings", label: "Settings", desc: "Profile & preferences" },
];

export default function OrgHomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { activeOrganizer, setActiveOrganizer, orgPages } = useActiveOrganizer();
  if (!activeOrganizer) return null;

  const { name, image_url, type } = activeOrganizer;

  const userMeta = user?.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
  const personalName = userMeta?.full_name ?? user?.email?.split("@")[0] ?? "You";
  const personalAvatar = userMeta?.avatar_url ?? null;

  const otherOrgs = orgPages.filter((o) => o.organizerId !== activeOrganizer.organizerId);

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 600, margin: "0 auto", padding: "32px 16px 80px", minHeight: "100dvh" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* Identity block */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 32 }}>
        {image_url ? (
          <img src={image_url} alt={name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-strong)" }} />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 14, flexShrink: 0,
            background: getLogoColor(name),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, fontWeight: 800, color: "rgba(255,255,255,0.85)",
          }}>
            {getInitials(name)}
          </div>
        )}
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 12, opacity: 0.45, marginTop: 3, textTransform: "capitalize" }}>{type}</div>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
        {QUICK_LINKS.map(({ href, label, desc }) => (
          <Link
            key={href}
            href={href}
            style={{
              padding: "18px 16px", borderRadius: 16,
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              textDecoration: "none", color: "inherit",
              display: "flex", flexDirection: "column", gap: 4,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 12, opacity: 0.45 }}>{desc}</div>
          </Link>
        ))}
      </div>

      {/* Switch identity */}
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
        Switch to
      </div>

      {/* Personal account */}
      <button
        type="button"
        onClick={() => { setActiveOrganizer(null); router.push("/profile"); }}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          width: "100%", padding: "12px 14px", marginBottom: 6,
          borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.04)", cursor: "pointer",
          color: "inherit", textAlign: "left",
        }}
      >
        {personalAvatar ? (
          <img src={personalAvatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: getAvatarColor(personalName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
            {getInitials(personalName)}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{personalName}</div>
          <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>Personal account</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>

      {/* Other organizer pages */}
      {otherOrgs.map((org) => (
        <button
          key={org.organizerId}
          type="button"
          onClick={() => setActiveOrganizer(org)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            width: "100%", padding: "12px 14px", marginBottom: 6,
            borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.04)", cursor: "pointer",
            color: "inherit", textAlign: "left",
          }}
        >
          {org.image_url ? (
            <img src={org.image_url} alt={org.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: getLogoColor(org.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
              {getInitials(org.name)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{org.name}</div>
            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1, textTransform: "capitalize" }}>{org.type}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ opacity: 0.3 }}>
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      ))}
    </main>
  );
}

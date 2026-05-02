/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";
import { supabaseBrowser } from "@/lib/supabase-browser";

const LOGO_COLORS = ["#1e3a5f","#2d4a1e","#4a1e2d","#1e2d4a","#3a2d1e","#1e4a3a"];
const AVATAR_COLORS = ["#7c3aed","#0ea5e9","#10b981","#f59e0b","#ef4444","#ec4899","#6366f1","#14b8a6"];

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

export default function OrgSettingsPage() {
  const { user } = useAuth();
  const { activeOrganizer, setActiveOrganizer, orgPages } = useActiveOrganizer();
  const router = useRouter();

  const userMeta = user?.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
  const personalName = userMeta?.full_name ?? user?.email?.split("@")[0] ?? "You";
  const personalAvatar = userMeta?.avatar_url ?? null;

  if (!activeOrganizer) return null;

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 80px", minHeight: "100dvh" }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 24px" }}>Settings</h1>

      {/* ── Active organizer actions ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Current identity
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
          {activeOrganizer.image_url ? (
            <img src={activeOrganizer.image_url} alt={activeOrganizer.name} style={{ width: 44, height: 44, borderRadius: 11, objectFit: "cover", flexShrink: 0, border: "1px solid var(--border-medium)" }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, background: logoColor(activeOrganizer.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
              {initials(activeOrganizer.name)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{activeOrganizer.name}</div>
            <div style={{ fontSize: 12, opacity: 0.45, marginTop: 1, textTransform: "capitalize" }}>{activeOrganizer.type}</div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5EA8FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {activeOrganizer.slug && (
            <Link
              href={`/o/${activeOrganizer.slug}`}
              style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid var(--border-strong)", background: "transparent", fontSize: 13, fontWeight: 600, textDecoration: "none", color: "inherit" }}
            >
              View public profile
            </Link>
          )}
          <Link
            href={`/dashboard/organizers/${activeOrganizer.organizerId}/edit`}
            style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid var(--border-strong)", background: "transparent", fontSize: 13, fontWeight: 600, textDecoration: "none", color: "inherit" }}
          >
            Edit profile
          </Link>
        </div>
      </section>

      {/* ── Switch identity ── */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 12 }}>
          Switch to
        </div>

        {/* Personal */}
        <button
          type="button"
          onClick={() => { setActiveOrganizer(null); router.push("/profile"); }}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", marginBottom: 6, borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "inherit", textAlign: "left" }}
        >
          {personalAvatar ? (
            <img src={personalAvatar} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: avatarColor(personalName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff" }}>
              {initials(personalName)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{personalName}</div>
            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>Personal account</div>
          </div>
        </button>

        {/* Other org pages */}
        {orgPages
          .filter((o) => o.organizerId !== activeOrganizer.organizerId)
          .map((org) => (
            <button
              key={org.organizerId}
              type="button"
              onClick={() => setActiveOrganizer(org)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "12px 16px", marginBottom: 6, borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)", cursor: "pointer", color: "inherit", textAlign: "left" }}
            >
              {org.image_url ? (
                <img src={org.image_url} alt={org.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: logoColor(org.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
                  {initials(org.name)}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{org.name}</div>
                <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1, textTransform: "capitalize" }}>{org.type}</div>
              </div>
            </button>
          ))
        }
      </section>

      {/* ── Sign out ── */}
      <button
        type="button"
        onClick={async () => { await supabaseBrowser().auth.signOut(); router.push("/"); }}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "14px 16px", borderRadius: 16, border: "1px solid rgba(239,68,68,0.20)", background: "rgba(239,68,68,0.06)", cursor: "pointer", color: "#ef4444", fontWeight: 600, fontSize: 14 }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        Sign out
      </button>
    </main>
  );
}

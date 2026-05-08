/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { useActiveOrganizer } from "@/app/components/ActiveOrganizerContext";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { GeneratedAvatar, getInitials } from "@/app/components/GeneratedAvatar";

const TYPE_LABELS: Record<string, string> = {
  venue: "Venue", promoter: "Promoter", artist: "Artist", business: "Business",
  festival: "Festival", collective: "Collective", brand: "Brand", nonprofit: "Non-profit",
  school: "School", other: "Organizer",
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrgProfileClient({
  organizerId,
  organizerName,
  organizerSlug,
  organizerCustomImageUrl,
  children,
}: {
  organizerId: string;
  organizerName: string;
  organizerSlug: string | null;
  organizerCustomImageUrl: string | null;
  /** Server-rendered name + type badge — rendered between the logo and action buttons. */
  children?: React.ReactNode;
}) {
  const { user, session } = useAuth();
  const router = useRouter();
  const { activeOrganizer, setActiveOrganizer, identityLoading, orgPages } = useActiveOrganizer();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followLoading, setFollowLoading] = useState(false);
  const [customImageUrl, setCustomImageUrl] = useState<string | null>(organizerCustomImageUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isActiveAsThisOrg = activeOrganizer?.organizerId === organizerId;

  // When acting as an organizer (and it's not this organizer), use org-to-org follow.
  // Otherwise fall back to personal follow.
  const orgFollowMode = !isActiveAsThisOrg && !identityLoading && !!activeOrganizer;

  // Reset follow state whenever the active identity changes to avoid showing stale state.
  React.useEffect(() => {
    setFollowing(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrganizer?.organizerId]);

  // Fetch follow status when signed in and not currently acting as this organizer.
  React.useEffect(() => {
    if (!user || !session || isActiveAsThisOrg || identityLoading) return;

    if (orgFollowMode && activeOrganizer) {
      fetch(
        `/api/organizers/${organizerId}/org-follow?followerOrgId=${activeOrganizer.organizerId}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      )
        .then((r) => r.json())
        .then((d: { ok: boolean; following?: boolean; error?: string }) => {
          if (d.ok) setFollowing(d.following ?? false);
          else console.error("[OrgProfileClient] org-follow status GET failed:", d.error);
        })
        .catch((err) => console.error("[OrgProfileClient] org-follow status fetch threw:", err));
    } else if (!orgFollowMode) {
      fetch(`/api/organizers/${organizerId}/follow`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => r.json())
        .then((d: { ok: boolean; following?: boolean }) => {
          if (d.ok) setFollowing(d.following ?? false);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, session?.access_token, isActiveAsThisOrg, identityLoading, activeOrganizer?.organizerId]);

  async function handleFollow() {
    if (!user || !session) {
      window.dispatchEvent(new Event("outsy:open-signin"));
      return;
    }
    setFollowLoading(true);
    const isFollowing = following;
    try {
      if (orgFollowMode && activeOrganizer) {
        const res = await fetch(`/api/organizers/${organizerId}/org-follow`, {
          method: isFollowing ? "DELETE" : "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ followerOrgId: activeOrganizer.organizerId }),
        });
        const data = (await res.json()) as { ok: boolean; following?: boolean; error?: string };
        if (data.ok) {
          setFollowing(data.following ?? !isFollowing);
        } else {
          console.error("[OrgProfileClient] org-follow action failed:", data.error ?? res.status);
        }
      } else {
        const res = await fetch(`/api/organizers/${organizerId}/follow`, {
          method: isFollowing ? "DELETE" : "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = (await res.json()) as { ok: boolean; following?: boolean; error?: string };
        if (data.ok) {
          setFollowing(data.following ?? !isFollowing);
        } else {
          console.error("[OrgProfileClient] personal follow action failed:", data.error ?? res.status);
        }
      }
    } catch (err) {
      console.error("[OrgProfileClient] follow fetch threw:", err);
    } finally {
      setFollowLoading(false);
    }
  }

  // Personal identity for the settings drawer — read from user metadata.
  // The profile page loads this from /api/profile but we keep it lightweight here.
  const userMeta = user?.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
  const personalName = userMeta?.full_name ?? user?.email?.split("@")[0] ?? "You";
  const personalAvatar = userMeta?.avatar_url ?? null;

  function handleShare() {
    const url = organizerSlug
      ? `${window.location.origin}/o/${organizerSlug}`
      : window.location.href;
    if (navigator.share) {
      navigator.share({ title: organizerName, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setShareMsg("Copied!");
        setTimeout(() => setShareMsg(null), 2000);
      });
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !session) return;
    setUploadError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`/api/organizers/${organizerId}/upload-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (data.ok && data.url) {
        setCustomImageUrl(data.url);
        window.dispatchEvent(
          new CustomEvent("outsy:org-image-updated", { detail: { organizerId, url: data.url } }),
        );
      } else {
        setUploadError(data.error ?? "Upload failed.");
      }
    } catch {
      setUploadError("Network error.");
    }
    // Reset so the same file can be re-selected if needed.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSignOut() {
    setSettingsOpen(false);
    await supabaseBrowser().auth.signOut();
  }

  return (
    <>
      {/* ── Settings gear (top-right, absolute within parent section) ── */}
      {isActiveAsThisOrg && (
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          style={{
            position: "absolute", top: 0, right: 0,
            width: 36, height: 36, borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "#C7D0DB",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <GearIcon />
        </button>
      )}

      {/* ── Avatar + glass card wrapper ── */}
      <div style={{ position: "relative", width: "100%", maxWidth: 360, paddingTop: 56, marginTop: 8 }}>

        {/* Logo — absolute, overlapping glass card from above */}
        <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 2 }}>
          <div style={{ position: "relative", width: 96, height: 96 }}>
            <GeneratedAvatar
              name={organizerName}
              imageUrl={customImageUrl}
              shape="square"
              size={96}
              borderRadius={20}
              style={{ boxShadow: "0 8px 28px rgba(0,0,0,0.55)" }}
            />
            {/* Camera badge — active-as-this-org only */}
            {isActiveAsThisOrg && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleImageUpload}
                  style={{ display: "none" }}
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Change photo"
                  title="Change photo"
                  style={{
                    position: "absolute", bottom: -3, right: -3,
                    width: 28, height: 28, borderRadius: 7,
                    border: "2px solid #0b0f18",
                    background: "#FFFFFF",
                    color: "rgba(0,0,0,0.75)",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <CameraIcon />
                </button>
              </>
            )}
          </div>
          {uploadError && (
            <div style={{ position: "absolute", bottom: -24, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: "#f87171", whiteSpace: "nowrap" }}>
              {uploadError}
            </div>
          )}
        </div>

        {/* Glass identity card */}
        <div style={{
          width: "100%",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.13)",
          borderRadius: 24,
          paddingTop: 52,
          paddingBottom: 20,
          paddingLeft: 20,
          paddingRight: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}>
          {children}
        </div>
      </div>

      {/* ── Action buttons — below the glass card ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap", justifyContent: "center" }}>
        {isActiveAsThisOrg ? (
          <Link
            href={`/dashboard/organizers/${organizerId}/edit`}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "9px 22px", borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              color: "#FFFFFF", fontWeight: 600, fontSize: 14, textDecoration: "none",
            }}
          >
            <EditIcon />
            Edit profile
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void handleFollow()}
              disabled={followLoading}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 22px", borderRadius: 999,
                border: following ? "1px solid rgba(255,255,255,0.14)" : "none",
                background: following ? "rgba(255,255,255,0.10)" : "rgba(94,168,255,0.85)",
                color: following ? "#C7D0DB" : "#fff",
                fontWeight: 600, fontSize: 14,
                cursor: followLoading ? "not-allowed" : "pointer",
                opacity: followLoading ? 0.6 : 1,
                transition: "background 0.15s, opacity 0.15s",
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {following ? "Followed" : "Follow"}
            </button>
            {user && (
              <Link
                href={`/social/messages/org/${organizerId}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 22px", borderRadius: 999,
                  border: "1px solid rgba(94,168,255,0.30)",
                  background: "rgba(94,168,255,0.10)",
                  color: "#5EA8FF", fontWeight: 600, fontSize: 14, textDecoration: "none",
                }}
              >
                <MessageIcon />
                Message
              </Link>
            )}
          </>
        )}
        <button
          type="button"
          onClick={handleShare}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "9px 22px", borderRadius: 999,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.05)",
            color: "#C7D0DB", fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          <ShareIcon />
          {shareMsg ?? "Share"}
        </button>
      </div>

      {/* ── Settings drawer ───────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setSettingsOpen(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.50)",
            zIndex: 300,
            display: "flex", justifyContent: "flex-end",
          }}
        >
          <div
            className="settings-drawer"
            style={{
              background: "var(--background)",
              borderRadius: "20px 0 0 20px",
              width: "min(320px, 100vw)",
              height: "100%",
              display: "flex", flexDirection: "column",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "max(20px, env(safe-area-inset-top)) 20px 16px" }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>Settings</h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close"
                style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-raised)", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6, color: "inherit" }}
              >
                ×
              </button>
            </div>

            {/* Account switcher + sign out */}
            <div style={{ borderTop: "1px solid var(--border)", flex: 1, overflowY: "auto" }}>

              {/* Active-as-this-org: admin actions */}
              {isActiveAsThisOrg && (
                <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                    {organizerName}
                  </div>
                  <Link
                    href={`/dashboard/organizers/${organizerId}/edit`}
                    onClick={() => setSettingsOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "var(--surface-raised)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                      <EditIcon />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Edit profile</span>
                  </Link>
                  <Link
                    href="/org/settings"
                    onClick={() => setSettingsOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "var(--surface-raised)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                      <GearIcon />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Organizer settings</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => { handleShare(); setSettingsOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 0", background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "var(--surface-raised)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                      <ShareIcon />
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{shareMsg ?? "Share profile"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveOrganizer(null); setSettingsOpen(false); router.push("/profile"); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 0", background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, background: "var(--surface-raised)", border: "1px solid var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.7 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>Switch to personal account</span>
                  </button>
                </div>
              )}

              <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.4, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
                  Account
                </div>

                {/* Personal identity */}
                <button
                  type="button"
                  onClick={() => { setActiveOrganizer(null); setSettingsOpen(false); router.push("/profile"); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "6px 0", background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left" }}
                >
                  <GeneratedAvatar name={personalName} imageUrl={personalAvatar} size={36} style={{ border: "1.5px solid var(--border-medium)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{personalName}</div>
                    <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>Personal account</div>
                  </div>
                  {activeOrganizer === null && !identityLoading && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5EA8FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>

                {/* Organizer identities */}
                {identityLoading ? (
                  <div className="skeleton" style={{ height: 36, borderRadius: 9, background: "var(--surface-raised)", marginTop: 4 }} />
                ) : (
                  orgPages.map((org) => {
                    const isActive = activeOrganizer?.organizerId === org.organizerId;

                    return (
                      <div key={org.organizerId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                        {/* Logo + name → navigate to org profile (no identity switch) */}
                        <Link
                          href={org.slug ? `/o/${org.slug}` : `/dashboard/organizers/${org.organizerId}/edit`}
                          onClick={() => setSettingsOpen(false)}
                          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}
                        >
                          <GeneratedAvatar name={org.name} imageUrl={org.custom_image_url} shape="square" size={36} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{org.name}</div>
                            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 1 }}>{TYPE_LABELS[org.type] ?? org.type}</div>
                          </div>
                        </Link>
                        {/* Switch button — activates identity and navigates to org profile */}
                        {isActive ? (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5EA8FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-label="Active" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setActiveOrganizer(org); setSettingsOpen(false); router.push(org.slug ? `/o/${org.slug}` : "/org/settings"); }}
                            style={{
                              flexShrink: 0, padding: "4px 10px", borderRadius: 14,
                              border: "1px solid rgba(94,168,255,0.30)",
                              background: "rgba(94,168,255,0.08)",
                              color: "#5EA8FF", fontSize: 11, fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            Switch
                          </button>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Add organizer */}
                {!identityLoading && (
                  <Link
                    href="/dashboard/organizers/new"
                    onClick={() => setSettingsOpen(false)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", marginTop: 2, textDecoration: "none", color: "inherit" }}
                  >
                    <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: "var(--surface-raised)", border: "1px dashed var(--border-strong)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.55 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 13, opacity: 0.55 }}>Add an organizer account</span>
                  </Link>
                )}
              </div>

              {/* Sign out */}
              <button
                type="button"
                onClick={handleSignOut}
                style={{ display: "flex", alignItems: "center", width: "100%", padding: "16px 20px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 15, fontWeight: 500, color: "#ef4444", textAlign: "left", gap: 12, boxSizing: "border-box" }}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

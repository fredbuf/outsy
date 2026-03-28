/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

type HeaderProfile = { avatar_url: string | null; display_name: string | null };

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

export function Header() {
  const { user, loading } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [profile, setProfile] = useState<HeaderProfile | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function openPanel() {
      setShowPanel(true);
      setEmailSent(false);
      setEmail("");
      setPanelError(null);
    }
    window.addEventListener("outsy:open-signin", openPanel);
    return () => window.removeEventListener("outsy:open-signin", openPanel);
  }, []);

  // Fetch avatar + display name when user signs in
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!user) { setProfile(null); return; }
    const uid = user.id;
    supabaseBrowser()
      .from("profiles")
      .select("avatar_url,display_name")
      .eq("id", uid)
      .single()
      .then(({ data }) => setProfile(data ?? null));
  }, [user]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showUserMenu]);

  async function handleGoogle() {
    const supabase = supabaseBrowser();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSigningIn(true);
    setPanelError(null);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSigningIn(false);
    if (error) {
      setPanelError(error.message);
    } else {
      setEmailSent(true);
    }
  }

  async function handleSignOut() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    setShowPanel(false);
    setShowUserMenu(false);
    setProfile(null);
  }

  const avatarLabel = profile?.display_name ?? user?.email?.split("@")[0] ?? null;

  return (
    <>
      <header
        className="site-header"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 24px",
          borderBottom: "1px solid var(--border)",
          position: "sticky",
          top: 0,
          background: "var(--background)",
          zIndex: 100,
        }}
      >
        <Link
          href="/events"
          style={{ fontWeight: 700, fontSize: 18, textDecoration: "none" }}
        >
          Outsy
        </Link>

        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link
            href="/events"
            className="nav-hide-mobile"
            style={{ padding: "6px 10px", fontSize: 13, opacity: 0.7, textDecoration: "none" }}
          >
            Events
          </Link>

          <Link
            href="/map"
            style={{ padding: "6px 10px", fontSize: 13, opacity: 0.7, textDecoration: "none", display: "flex", alignItems: "center" }}
          >
            <span className="nav-label">Map</span>
            <span className="nav-icon" aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                <line x1="9" y1="3" x2="9" y2="18" />
                <line x1="15" y1="6" x2="15" y2="21" />
              </svg>
            </span>
          </Link>

          {!loading && user && (
            <Link
              href="/events/new"
              style={{ padding: "6px 10px", fontSize: 13, opacity: 0.7, textDecoration: "none", display: "flex", alignItems: "center" }}
            >
              <span className="nav-label">Create</span>
              <span className="nav-icon" aria-hidden>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </span>
            </Link>
          )}

          {!loading && (
            user ? (
              /* ── Avatar + dropdown ─────────────────────────────────────── */
              <div ref={userMenuRef} style={{ position: "relative", marginLeft: 4 }}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  aria-label="User menu"
                  style={{
                    padding: 0,
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={avatarLabel ?? ""}
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "1.5px solid var(--border-strong)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: "50%",
                        background: getAvatarColor(avatarLabel),
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        userSelect: "none",
                      }}
                    >
                      {getInitials(avatarLabel)}
                    </div>
                  )}
                </button>

                {showUserMenu && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      background: "var(--background)",
                      border: "1px solid var(--border-strong)",
                      borderRadius: 12,
                      padding: 4,
                      minWidth: 160,
                      zIndex: 300,
                      display: "grid",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                    }}
                  >
                    <Link
                      href="/profile"
                      onClick={() => setShowUserMenu(false)}
                      style={{
                        padding: "10px 14px",
                        fontSize: 14,
                        textDecoration: "none",
                        borderRadius: 8,
                        display: "block",
                        color: "inherit",
                      }}
                    >
                      View profile
                    </Link>
                    <button
                      onClick={handleSignOut}
                      style={{
                        padding: "10px 14px",
                        fontSize: 14,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        borderRadius: 8,
                        color: "inherit",
                        width: "100%",
                      }}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => {
                  setShowPanel(true);
                  setEmailSent(false);
                  setEmail("");
                  setPanelError(null);
                }}
                style={{
                  marginLeft: 4,
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: "var(--btn-bg)",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Sign in
              </button>
            )
          )}
        </nav>
      </header>

      {/* Sign-in overlay */}
      {showPanel && !user && (
        <div
          onClick={(e) => e.target === e.currentTarget && setShowPanel(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 28,
              width: "100%",
              maxWidth: 380,
              display: "grid",
              gap: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Sign in to Outsy</h2>
              <button
                onClick={() => setShowPanel(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 20,
                  opacity: 0.5,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <button
              onClick={handleGoogle}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 16px",
                borderRadius: 10,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: 0.4,
                fontSize: 12,
              }}
            >
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid currentColor" }} />
              or
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid currentColor" }} />
            </div>

            {emailSent ? (
              <p style={{ fontSize: 14, opacity: 0.75, textAlign: "center", lineHeight: 1.6 }}>
                Check your inbox — we sent a magic link to <strong>{email}</strong>.
              </p>
            ) : (
              <form onSubmit={handleMagicLink} style={{ display: "grid", gap: 8 }}>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                    fontSize: 14,
                  }}
                />
                <button
                  type="submit"
                  disabled={signingIn || !email.trim()}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                    background:
                      signingIn || !email.trim() ? "var(--surface-subtle)" : "var(--btn-bg)",
                    fontWeight: 700,
                    cursor: signingIn || !email.trim() ? "not-allowed" : "pointer",
                    fontSize: 14,
                  }}
                >
                  {signingIn ? "Sending…" : "Send magic link"}
                </button>
                {panelError && (
                  <p style={{ color: "#dc2626", fontSize: 13 }}>{panelError}</p>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

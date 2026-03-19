"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function Header() {
  const { user, loading } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

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
  }

  const displayName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "Account";

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

        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {user ? (
              <>
                <span className="header-display-name" style={{ fontSize: 13, opacity: 0.75 }}>{displayName}</span>
                <button
                  onClick={handleSignOut}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-strong)",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setShowPanel(true);
                  setEmailSent(false);
                  setEmail("");
                  setPanelError(null);
                }}
                style={{
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
            )}
          </div>
        )}
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

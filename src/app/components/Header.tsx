"use client";

// ── Headless sign-in modal ──────────────────────────────────────────────────
// The visible header bar has been removed. This component now renders only
// the sign-in overlay panel, triggered by window event "outsy:open-signin".
// All navigation lives in <BottomNav>. Profile + sign-out live in <AppTopBar>.
//
// Magic link (signInWithOtp) is temporarily hidden while reliability is improved.
// The Supabase email auth provider remains enabled; re-add the form to restore it.

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function Header() {
  const { user } = useAuth();
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    function openPanel() {
      setShowPanel(true);
    }
    window.addEventListener("outsy:open-signin", openPanel);
    return () => window.removeEventListener("outsy:open-signin", openPanel);
  }, []);

  async function handleGoogle() {
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  // Apple sign-in is implemented but hidden until the provider is configured.
  // To re-enable: uncomment the button in the JSX below.
  // async function handleApple() {
  //   await supabaseBrowser().auth.signInWithOAuth({
  //     provider: "apple",
  //     options: { redirectTo: `${window.location.origin}/auth/callback` },
  //   });
  // }

  if (!showPanel || user) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setShowPanel(false)}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 400,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          padding: 28,
          width: "100%", maxWidth: 380,
          display: "grid", gap: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Sign in to Outsy</h2>
          <button
            onClick={() => setShowPanel(false)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, opacity: 0.45, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Apple — hidden until provider is configured
        <button onClick={handleApple} ...>Continue with Apple</button>
        */}

        {/* Google */}
        <button
          onClick={handleGoogle}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "11px 16px", borderRadius: 12,
            border: "1px solid var(--border-strong)", background: "transparent",
            cursor: "pointer", fontWeight: 600, fontSize: 14,
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
      </div>
    </div>
  );
}

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

// ── In-app browser detection ────────────────────────────────────────────────
// Google OAuth returns 403 disallowed_useragent in embedded WebViews (Facebook,
// Messenger, Instagram, TikTok, LinkedIn, etc.). Detect by checking for known
// UA tokens that appear only in those in-app browsers.
function detectInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /FBAN|FBAV|Instagram|FB_IAB|LinkedInApp|BytedanceWebview|TikTok|Twitter\/|musical_ly/i.test(ua);
}

// Returns true on iOS (iPhone/iPad) — used to choose the CTA label.
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function Header() {
  const { user } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  // Lazy initializer — runs once on mount, safe because detectInAppBrowser
  // guards against server-side rendering via the navigator typeof check.
  const [inAppBrowser] = useState(() => detectInAppBrowser());

  useEffect(() => {
    function openPanel() {
      setShowPanel(true);
    }
    window.addEventListener("outsy:open-signin", openPanel);
    return () => window.removeEventListener("outsy:open-signin", openPanel);
  }, []);

  async function handleGoogle() {
    // Guard: never attempt OAuth inside an in-app browser — it will always fail
    // with 403 disallowed_useragent. The UI already shows the fallback screen,
    // so this is a safety net for direct calls.
    if (detectInAppBrowser()) return;
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

  // ── In-app browser fallback screen ────────────────────────────────────────
  if (inAppBrowser) {
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";
    const ios = isIOS();
    return (
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 400,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          style={{
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 24,
            padding: "28px 24px 32px",
            width: "100%", maxWidth: 420,
            display: "grid", gap: 16,
            boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            textAlign: "center",
          }}
        >
          {/* Icon */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "var(--surface-raised)",
              border: "1px solid var(--border-strong)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              Open in your browser to sign in
            </h2>
            <p style={{ fontSize: 14, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
              Sign-in with Google doesn&apos;t work inside apps like Instagram or Messenger.
              Tap below to open Outsy in {ios ? "Safari" : "your browser"}.
            </p>
          </div>

          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "13px 20px", borderRadius: 14,
              background: "var(--foreground)", color: "var(--background)",
              fontWeight: 700, fontSize: 15, textDecoration: "none",
            }}
          >
            {ios ? "Open in Safari" : "Open in browser"}
          </a>

          <button
            onClick={() => setShowPanel(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 14, opacity: 0.45, padding: 4, color: "inherit",
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  // ── Normal sign-in panel ───────────────────────────────────────────────────
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

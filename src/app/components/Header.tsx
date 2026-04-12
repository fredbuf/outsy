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

type InAppSource = "instagram" | "facebook" | "tiktok" | "twitter" | "linkedin" | "other";

function detectInAppSource(): InAppSource | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook"; // Facebook + Messenger share tokens
  if (/BytedanceWebview|TikTok|musical_ly/i.test(ua)) return "tiktok";
  if (/Twitter\//i.test(ua)) return "twitter";
  if (/LinkedInApp/i.test(ua)) return "linkedin";
  return null;
}

function detectInAppBrowser(): boolean {
  return detectInAppSource() !== null;
}

// Returns true on iOS (iPhone/iPad) — used to pick Chrome scheme.
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
  const [copied, setCopied] = useState(false);

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
    const source = detectInAppSource();

    // App name for copy
    const appName =
      source === "instagram" ? "Instagram"
      : source === "facebook" ? "Messenger or Facebook"
      : source === "tiktok"   ? "TikTok"
      : source === "twitter"  ? "X (Twitter)"
      : source === "linkedin" ? "LinkedIn"
      : "this app";

    // Per-app "how to open in browser" instructions
    const instructions: string | null =
      source === "instagram"
        ? 'Tap ··· in the top-right corner, then "Open in external browser".'
        : source === "facebook"
        ? 'Tap ··· in the bottom-right corner, then "Open in browser".'
        : source === "tiktok"
        ? 'Tap ··· in the top-right corner, then "Open in browser".'
        : source === "twitter"
        ? 'Tap ··· in the top-right corner, then "Open in browser".'
        : null;

    // Chrome deep link — best effort, fails gracefully if Chrome not installed
    // iOS: googlechromes://<url-without-scheme>
    // Android: intent://<url-without-scheme>#Intent;scheme=https;package=com.android.chrome;end
    function buildChromeUrl(url: string): string {
      const stripped = url.replace(/^https?:\/\//, "");
      if (ios) return `googlechromes://${stripped}`;
      return `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;end`;
    }

    // Copy link to clipboard
    function handleCopy() {
      navigator.clipboard.writeText(currentUrl).then(
        () => { setCopied(true); setTimeout(() => setCopied(false), 2200); },
        () => {
          // Fallback for browsers that block clipboard API
          const el = document.createElement("input");
          el.value = currentUrl;
          document.body.appendChild(el);
          el.select();
          document.execCommand("copy");
          document.body.removeChild(el);
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        }
      );
    }

    return (
      <div
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.78)",
          zIndex: 400,
          display: "flex", alignItems: "flex-end", justifyContent: "center",
        }}
      >
        <div
          style={{
            background: "var(--background, #0e0807)",
            border: "1px solid var(--border, rgba(255,255,255,0.10))",
            borderRadius: "24px 24px 0 0",
            padding: "28px 24px max(28px, env(safe-area-inset-bottom))",
            width: "100%", maxWidth: 480,
            display: "flex", flexDirection: "column", gap: 20,
            boxShadow: "0 -8px 40px rgba(0,0,0,0.55)",
          }}
        >
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>
                Google sign-in doesn&apos;t work in {appName}
              </div>
              <div style={{ fontSize: 13, opacity: 0.55, lineHeight: 1.45 }}>
                Open Outsy in your browser to sign in.
              </div>
            </div>
          </div>

          {/* Per-app instructions */}
          {instructions && (
            <div style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.09)",
              fontSize: 13, lineHeight: 1.5, opacity: 0.75,
            }}>
              <span style={{ fontWeight: 600, opacity: 1 }}>How to open in your browser: </span>
              {instructions}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Copy link — most reliable */}
            <button
              type="button"
              onClick={handleCopy}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                padding: "13px 20px", borderRadius: 14,
                background: copied ? "rgba(167,139,250,0.15)" : "var(--foreground, #eae8e4)",
                color: copied ? "#a78bfa" : "var(--background, #0e0807)",
                border: copied ? "1px solid rgba(167,139,250,0.35)" : "none",
                fontWeight: 700, fontSize: 15, cursor: "pointer",
                transition: "background 0.2s, color 0.2s",
              }}
            >
              {copied ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Link copied!
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                  Copy link
                </>
              )}
            </button>

            {/* Secondary row: Open in browser + Try Chrome */}
            <div style={{ display: "flex", gap: 8 }}>
              {/* Open in browser — best-effort, may stay in-app */}
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px 14px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  fontWeight: 600, fontSize: 14,
                  textDecoration: "none", color: "inherit",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Open in browser
              </a>

              {/* Try Chrome — deep-link, silently fails if Chrome not installed */}
              <a
                href={buildChromeUrl(currentUrl)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  padding: "11px 14px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  fontWeight: 600, fontSize: 14,
                  textDecoration: "none", color: "inherit",
                  flexShrink: 0,
                }}
                onClick={(e) => {
                  // Prevent navigation error toast by handling the click manually
                  e.preventDefault();
                  window.location.href = buildChromeUrl(currentUrl);
                }}
              >
                {/* Chrome "C" monogram */}
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                  <circle cx="12" cy="12" r="10" fill="#fff" opacity="0.1"/>
                  <circle cx="12" cy="12" r="4" fill="#4285F4"/>
                  <path d="M12 8h8.66A10 10 0 0 0 12 2v6z" fill="#EA4335"/>
                  <path d="M12 8h8.66a10 10 0 0 1-4.33 13.66L12 16v-8z" fill="#FBBC05"/>
                  <path d="M12 16l-4.33 5.66A10 10 0 0 1 3.34 8H12v8z" fill="#34A853"/>
                </svg>
                Try Chrome
              </a>
            </div>
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={() => setShowPanel(false)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 14, opacity: 0.4, padding: 0, color: "inherit",
              alignSelf: "center",
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

"use client";

import Link from "next/link";
import { useAuth } from "./components/AuthProvider";

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <main
      style={{
        minHeight: "calc(100dvh - 57px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px 48px",
        background:
          "radial-gradient(ellipse 120% 60% at 50% -5%, rgba(124, 58, 237, 0.09) 0%, transparent 65%)",
      }}
    >
      <div
        style={{
          textAlign: "center",
          display: "grid",
          gap: 32,
          maxWidth: 420,
          width: "100%",
        }}
      >
        <div style={{ display: "grid", gap: 14 }}>
          <h1
            style={{
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            Outsy
          </h1>
          <p style={{ fontSize: 18, opacity: 0.6, lineHeight: 1.55 }}>
            All your events under one app
          </p>
        </div>

        {!loading && (
          <div
            style={{
              display: "flex",
              gap: 10,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/events"
              style={{
                padding: "13px 32px",
                borderRadius: 12,
                background: "var(--foreground)",
                color: "var(--background)",
                fontWeight: 700,
                fontSize: 15,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Explore
            </Link>

            {user ? (
              <Link
                href="/profile"
                style={{
                  padding: "13px 32px",
                  borderRadius: 12,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  fontWeight: 600,
                  fontSize: 15,
                  textDecoration: "none",
                  display: "inline-block",
                }}
              >
                Profile
              </Link>
            ) : (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("outsy:open-signin"))
                }
                style={{
                  padding: "13px 32px",
                  borderRadius: 12,
                  border: "1px solid var(--border-strong)",
                  background: "transparent",
                  fontWeight: 600,
                  fontSize: 15,
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                Sign in
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

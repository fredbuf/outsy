"use client";

import Link from "next/link";
import { useAuth } from "./components/AuthProvider";

export default function LandingPage() {
  const { user, loading } = useAuth();

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 24px",
        position: "relative",
        isolation: "isolate",
        overflow: "hidden",
        background: "#0B0F14",
        color: "#F5F7FA",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />
      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
          width: "100%",
          maxWidth: 375,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontSize: 48,
            fontWeight: 800,
            color: "#F5F7FA",
            letterSpacing: "-0.02em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          Outsy
        </h1>

        <p
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#F5F7FA",
            lineHeight: 1.2,
            margin: 0,
          }}
        >
          All your events. One app.
        </p>

        {!loading && (
          <div
            style={{
              display: "flex",
              gap: 16,
              marginTop: 28,
              justifyContent: "center",
            }}
          >
            <Link href="/events" className="glass-pill">
              Explore
            </Link>

            {user ? (
              <Link href="/profile" className="glass-pill-blue">
                Profile
              </Link>
            ) : (
              <button
                type="button"
                className="glass-pill-blue"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent("outsy:open-signin"))
                }
              >
                Sign up
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

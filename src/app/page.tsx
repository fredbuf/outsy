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
        background: "linear-gradient(172.5deg, rgb(67,92,122) 0%, rgb(11,15,20) 70%)",
        padding: "0 24px",
        position: "relative",
        overflow: "hidden",
      }}
    >
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
            <Link
              href="/events"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 120,
                height: 41,
                borderRadius: 20,
                background: "rgba(18,25,36,0.20)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                color: "#F5F7FA",
                fontSize: 16,
                fontWeight: 600,
                textDecoration: "none",
                letterSpacing: "-0.01em",
              }}
            >
              Explore
            </Link>

            {user ? (
              <Link
                href="/profile"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 120,
                  height: 41,
                  borderRadius: 20,
                  background: "rgba(59,130,246,0.19)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  color: "#F5F7FA",
                  fontSize: 16,
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: "-0.01em",
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
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 120,
                  height: 41,
                  borderRadius: 20,
                  background: "rgba(59,130,246,0.19)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  color: "#F5F7FA",
                  fontSize: 16,
                  fontWeight: 600,
                  cursor: "pointer",
                  letterSpacing: "-0.01em",
                }}
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

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  venue: "Venue",
  promoter: "Promoter",
  artist: "Artist",
  business: "Business",
  festival: "Festival",
  collective: "Collective",
  brand: "Brand",
  nonprofit: "Non-profit",
  school: "School",
  other: "Other",
};

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
};

// ── Types ─────────────────────────────────────────────────────────────────────

type OrganizerEntry = {
  organizerId: string;
  name: string;
  type: string;
  slug: string | null;
  image_url: string | null;
  custom_image_url: string | null;
  role: string;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 72,
            borderRadius: 12,
            background: "var(--surface-raised)",
            marginBottom: 1,
            opacity: 1 - i * 0.25,
          }}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OrganizerDashboardPage() {
  const { user, loading: authLoading, session } = useAuth();
  const [organizers, setOrganizers] = useState<OrganizerEntry[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !session?.access_token) return;
    setFetching(true);
    fetch("/api/organizers/mine", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) setOrganizers(json.organizers ?? []);
        else setFetchError(json?.error ?? "Failed to load organizers.");
      })
      .catch(() => setFetchError("Failed to load organizers."))
      .finally(() => setFetching(false));
  }, [authLoading, session?.access_token]);

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main
        className="page-main app-page"
        style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 64px", minHeight: "100dvh" }}
      >
        <div className="app-bg-gradient" aria-hidden="true" />
        <ListSkeleton />
      </main>
    );
  }

  // ── Signed-out gate ───────────────────────────────────────────────────────────
  if (!user) {
    return (
      <main
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "64px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: "var(--surface-raised)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.45,
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <rect x="2" y="7" width="20" height="14" rx="2" />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Organizer pages</h1>
        <p style={{ opacity: 0.55, margin: 0, lineHeight: 1.6, fontSize: 15 }}>
          Sign in to create and manage organizer pages.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            marginTop: 4,
            padding: "11px 28px",
            borderRadius: 12,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  // ── Signed-in ─────────────────────────────────────────────────────────────────
  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        minHeight: "100dvh",
        display: "grid",
        gap: 28,
        alignContent: "start",
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Organizer Pages
          </h1>
          <p style={{ fontSize: 13, opacity: 0.5, margin: "4px 0 0" }}>Pages you manage</p>
        </div>
        <Link
          href="/dashboard/organizers/new"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "9px 16px",
            borderRadius: 20,
            background: "#3B82F6",
            color: "#fff",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
            flexShrink: 0,
            letterSpacing: "-0.01em",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New page
        </Link>
      </section>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      {fetching ? (
        <ListSkeleton />
      ) : fetchError ? (
        <p style={{ opacity: 0.5, fontSize: 14, textAlign: "center", margin: 0 }}>
          {fetchError}
        </p>
      ) : organizers.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            padding: "48px 0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "var(--surface-raised)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.5,
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
            </svg>
          </div>
          <p style={{ opacity: 0.5, fontSize: 14, margin: 0 }}>No organizer pages yet.</p>
          <Link
            href="/dashboard/organizers/new"
            style={{ fontSize: 14, color: "#5EA8FF", textDecoration: "none", fontWeight: 600 }}
          >
            Create your first page →
          </Link>
        </div>
      ) : (
        <div>
          {organizers.map((org, i) => (
            <div
              key={org.organizerId}
              style={{
                display: "flex",
                gap: 12,
                padding: "12px 0",
                borderBottom: i < organizers.length - 1 ? "1px solid var(--border)" : "none",
                alignItems: "center",
              }}
            >
              {/* Logo */}
              <GeneratedAvatar name={org.name} imageUrl={org.custom_image_url} shape="square" size={48} borderRadius={12} />

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 15,
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {org.name}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      padding: "2px 8px",
                      borderRadius: 20,
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border-medium)",
                      color: "var(--accent)",
                    }}
                  >
                    {TYPE_LABELS[org.type] ?? org.type}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.45 }}>
                    {ROLE_LABELS[org.role] ?? org.role}
                  </span>
                </div>
              </div>

              {/* Edit */}
              {(org.role === "owner" || org.role === "admin") && (
                <Link
                  href={`/dashboard/organizers/${org.organizerId}/edit`}
                  title="Edit"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "inherit",
                    textDecoration: "none",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </Link>
              )}

              {/* Public profile link */}
              {org.slug && (
                <Link
                  href={`/o/${org.slug}`}
                  title="View public page"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border)",
                    color: "inherit",
                    textDecoration: "none",
                    flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── Constants ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BIO_MAX = 1000;

// ── Types ─────────────────────────────────────────────────────────────────────

type Organizer = {
  id: string;
  name: string;
  type: string;
  slug: string | null;
  bio: string | null;
  website_url: string | null;
  instagram_url: string | null;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          borderRadius: 14,
          background: "var(--surface-raised)",
          border: "1px solid var(--border-strong)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "10px 14px 2px" }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "var(--foreground)",
              opacity: 0.38,
              letterSpacing: "0.07em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
        </div>
        {children}
      </div>
      {hint && (
        <p style={{ fontSize: 11, opacity: 0.35, margin: "5px 2px 0", lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  padding: "4px 14px 12px",
  background: "none",
  border: "none",
  outline: "none",
  fontSize: 16,
  fontWeight: 500,
  color: "var(--foreground)",
  fontFamily: "inherit",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "none",
  lineHeight: 1.5,
  minHeight: 84,
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function FormSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {[80, 60, 100, 60].map((w, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: i === 2 ? 108 : 64,
            borderRadius: 14,
            background: "var(--surface-raised)",
            opacity: 1 - i * 0.18,
          }}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EditOrganizerPage() {
  const { user, loading: authLoading, session } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";

  // Organizer data (from public read)
  const [organizer, setOrganizer] = useState<Organizer | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Fetch organizer's current values via public read — no auth required for the
  // read itself; PATCH enforces owner/admin authorization server-side.
  useEffect(() => {
    if (!id || !UUID_RE.test(id)) {
      setNotFound(true);
      return;
    }
    supabaseBrowser()
      .from("organizers")
      .select("id,name,type,slug,bio,website_url,instagram_url")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setNotFound(true); return; }
        const org = data as Organizer;
        setOrganizer(org);
        setName(org.name);
        setBio(org.bio ?? "");
        setWebsiteUrl(org.website_url ?? "");
        setInstagramUrl(org.instagram_url ?? "");
      });
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token || !organizer) return;
    setSubmitting(true);
    setSubmitError(null);
    setSaved(false);

    let res: Response;
    try {
      res = await fetch(`/api/organizers/${id}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          bio: bio.trim() || null,
          website_url: websiteUrl.trim() || null,
          instagram_url: instagramUrl.trim() || null,
        }),
      });
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
      return;
    }

    const json = await res.json();
    setSubmitting(false);

    if (json?.ok) {
      setSaved(true);
      const dest = organizer?.slug ? `/o/${organizer.slug}` : "/profile";
      setTimeout(() => router.push(dest), 900);
    } else {
      setSubmitError(json?.error ?? "Failed to save. Please try again.");
    }
  }

  // ── Auth loading ─────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <main
        className="page-main app-page"
        style={{ maxWidth: 640, margin: "0 auto", padding: "28px 16px 64px", minHeight: "100dvh" }}
      >
        <div className="app-bg-gradient" aria-hidden="true" />
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
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sign in required</h1>
        <p style={{ opacity: 0.55, margin: 0, lineHeight: 1.6, fontSize: 15 }}>
          Sign in to edit an organizer page.
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

  // ── Not found ─────────────────────────────────────────────────────────────────
  if (notFound) {
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
        <p style={{ opacity: 0.55, fontSize: 15, margin: 0 }}>Organizer not found.</p>
        <Link href="/profile" style={{ color: "#5EA8FF", textDecoration: "none", fontSize: 14 }}>
          ← Back to profile
        </Link>
      </main>
    );
  }

  // ── Form ──────────────────────────────────────────────────────────────────────
  return (
    <main
      className="page-main app-page"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "28px 16px 64px",
        minHeight: "100dvh",
        border: "1.5px solid rgba(255,255,255,0.10)",
        boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
      }}
    >
      <div className="app-bg-gradient" aria-hidden="true" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <section
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingTop: 8,
          marginBottom: 28,
        }}
      >
        <Link
          href={organizer?.slug ? `/o/${organizer.slug}` : "/profile"}
          aria-label="Back"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--surface-raised)",
            border: "1px solid var(--border-strong)",
            color: "inherit",
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>

        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Edit organizer
          </h1>
          {organizer && (
            <p
              style={{
                fontSize: 13,
                opacity: 0.45,
                margin: "2px 0 0",
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              }}
            >
              {organizer.name}
            </p>
          )}
        </div>
      </section>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      {!organizer ? (
        <FormSkeleton />
      ) : (
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {/* Name */}
          <FieldGroup label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Organizer name"
              maxLength={120}
              required
              autoComplete="off"
              style={inputStyle}
            />
          </FieldGroup>

          {/* Bio */}
          <FieldGroup label="Bio" hint={`${bio.length} / ${BIO_MAX}`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short description…"
              maxLength={BIO_MAX}
              rows={3}
              style={textareaStyle}
            />
          </FieldGroup>

          {/* Website */}
          <FieldGroup label="Website URL">
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              maxLength={500}
              autoComplete="off"
              style={inputStyle}
            />
          </FieldGroup>

          {/* Instagram */}
          <FieldGroup label="Instagram URL">
            <input
              type="url"
              value={instagramUrl}
              onChange={(e) => setInstagramUrl(e.target.value)}
              placeholder="https://instagram.com/yourpage"
              maxLength={500}
              autoComplete="off"
              style={inputStyle}
            />
          </FieldGroup>

          {/* Error */}
          {submitError && (
            <p style={{ fontSize: 13, color: "#f87171", margin: "4px 0 0" }}>
              {submitError}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || saved || !name.trim()}
            style={{
              marginTop: 8,
              padding: "15px",
              borderRadius: 14,
              background: saved
                ? "rgba(74,222,128,0.15)"
                : submitting
                ? "rgba(94,168,255,0.10)"
                : "rgba(94,168,255,0.18)",
              border: saved
                ? "1px solid rgba(74,222,128,0.28)"
                : "1px solid rgba(94,168,255,0.30)",
              color: saved ? "#4ade80" : "#5EA8FF",
              cursor: submitting || saved || !name.trim() ? "not-allowed" : "pointer",
              fontWeight: 700,
              fontSize: 15,
              opacity: !name.trim() && !saved ? 0.55 : 1,
              transition: "background 0.2s, color 0.2s, border 0.2s",
            }}
          >
            {saved ? "Saved ✓" : submitting ? "Saving…" : "Save changes"}
          </button>

          {/* View public page shortcut */}
          {organizer.slug && (
            <Link
              href={`/o/${organizer.slug}`}
              style={{
                fontSize: 12,
                color: "#5EA8FF",
                textDecoration: "none",
                textAlign: "center",
                display: "block",
                paddingTop: 4,
                opacity: 0.7,
              }}
            >
              View public page →
            </Link>
          )}
        </form>
      )}
    </main>
  );
}

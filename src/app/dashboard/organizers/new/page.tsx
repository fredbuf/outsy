"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";

// ── Types ─────────────────────────────────────────────────────────────────────

const VALID_TYPES = [
  { value: "venue",      label: "Venue" },
  { value: "promoter",  label: "Promoter" },
  { value: "artist",    label: "Artist" },
  { value: "business",  label: "Business" },
  { value: "festival",  label: "Festival" },
  { value: "collective",label: "Collective" },
  { value: "brand",     label: "Brand" },
  { value: "nonprofit", label: "Non-profit" },
  { value: "school",    label: "School" },
  { value: "other",     label: "Other" },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Mirrors the slugify() function in the API route exactly so the preview
 * matches what the server will store.
 */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Styled input group — label above, input/select/textarea below, all inside a
 * single rounded container matching the profile-edit modal pattern.
 */
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NewOrganizerPage() {
  const { user, loading: authLoading, session } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  // Focus name on mount once auth resolves
  useEffect(() => {
    if (!authLoading && user) {
      nameRef.current?.focus();
    }
  }, [authLoading, user]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    // Allow only slug-safe characters while typing.
    const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    setSlugEdited(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.access_token) return;
    setSubmitting(true);
    setSubmitError(null);

    const body: Record<string, string> = {
      name: name.trim(),
      type,
    };
    if (slug.trim()) body.slug = slug.trim();
    if (bio.trim()) body.bio = bio.trim();
    if (websiteUrl.trim()) body.website_url = websiteUrl.trim();
    if (instagramUrl.trim()) body.instagram_url = instagramUrl.trim();

    try {
      const res = await fetch("/api/organizers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.ok) {
        router.push(json.slug ? `/o/${json.slug}` : "/profile");
      } else {
        setSubmitError(json?.error ?? "Failed to create organizer. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setSubmitError("Network error. Please try again.");
      setSubmitting(false);
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
          Sign in to create an organizer page.
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
          position: "relative",
          marginBottom: 28,
        }}
      >
        {/* Back */}
        <Link
          href="/profile"
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

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Create organizer page
          </h1>
        </div>
      </section>

      {/* ── Form ───────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* Name */}
        <FieldGroup label="Name *">
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g. New City Gas"
            maxLength={120}
            required
            autoComplete="off"
            style={inputStyle}
          />
        </FieldGroup>

        {/* Type */}
        <FieldGroup label="Type *">
          <div style={{ position: "relative" }}>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              required
              style={{
                ...inputStyle,
                appearance: "none",
                WebkitAppearance: "none",
                paddingRight: 36,
                cursor: "pointer",
                // browsers need explicit color for select in dark mode
                colorScheme: "dark",
              } as React.CSSProperties}
            >
              <option value="" disabled>Select a type…</option>
              {VALID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {/* Chevron */}
            <div
              style={{
                position: "absolute",
                right: 14,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </FieldGroup>

        {/* Slug */}
        <FieldGroup
          label="Slug"
          hint={`Public URL: outsy.ca/o/${slug || "your-slug"}`}
        >
          <div style={{ display: "flex", alignItems: "center", padding: "4px 14px 12px", gap: 2 }}>
            <span style={{ fontSize: 15, opacity: 0.35, userSelect: "none", whiteSpace: "nowrap" }}>
              /o/
            </span>
            <input
              value={slug}
              onChange={(e) => handleSlugChange(e.target.value)}
              placeholder="auto-generated"
              maxLength={100}
              autoComplete="off"
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                fontSize: 16,
                fontWeight: 500,
                color: "var(--foreground)",
                fontFamily: "inherit",
              }}
            />
          </div>
        </FieldGroup>

        {/* Bio */}
        <FieldGroup label="Bio">
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description of your organization…"
            maxLength={1000}
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
          disabled={submitting || !name.trim() || !type}
          style={{
            marginTop: 8,
            padding: "15px",
            borderRadius: 14,
            background: submitting
              ? "rgba(94,168,255,0.10)"
              : "rgba(94,168,255,0.18)",
            border: "1px solid rgba(94,168,255,0.30)",
            color: "#5EA8FF",
            cursor: submitting || !name.trim() || !type ? "not-allowed" : "pointer",
            fontWeight: 700,
            fontSize: 15,
            opacity: submitting || !name.trim() || !type ? 0.55 : 1,
            transition: "opacity 0.15s, background 0.15s",
          }}
        >
          {submitting ? "Creating…" : "Create organizer page"}
        </button>
      </form>
    </main>
  );
}

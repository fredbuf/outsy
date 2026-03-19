"use client";

import { FormEvent, useEffect, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

type FormState = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  category: "music" | "nightlife" | "art";
  venueName: string;
  venueAddress: string;
  venueCity: string;
  sourceUrl: string;
  visibility: "public" | "private";
};

type VenueSuggestion = {
  id: string;
  name: string;
  city: string | null;
  address_line1: string | null;
};

const initialForm: FormState = {
  title: "",
  description: "",
  startAt: "",
  endAt: "",
  category: "music",
  venueName: "",
  venueAddress: "",
  venueCity: "Montréal",
  sourceUrl: "",
  visibility: "public",
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

export function SubmitEventForm({ onSignInRequest }: { onSignInRequest?: () => void }) {
  const router = useRouter();
  const { user, loading: authLoading, session } = useAuth();
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSubmitted, setPublicSubmitted] = useState(false);

  // Venue autocomplete
  const [venueId, setVenueId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const venueWrapperRef = useRef<HTMLDivElement>(null);

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke object URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function handleImageChange(file: File | null) {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setImageFile(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  // Close venue dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (venueWrapperRef.current && !venueWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleVenueNameChange(value: string) {
    setVenueId(null);
    setForm((f) => ({ ...f, venueName: value }));
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/search?q=${encodeURIComponent(value.trim())}`);
        const json = await res.json();
        const venues: VenueSuggestion[] = json?.venues ?? [];
        setSuggestions(venues);
        setShowSuggestions(venues.length > 0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 250);
  }

  function selectVenue(v: VenueSuggestion) {
    setVenueId(v.id);
    setForm((f) => ({
      ...f,
      venueName: v.name,
      venueAddress: v.address_line1 ?? f.venueAddress,
      venueCity: v.city ?? f.venueCity,
    }));
    setSuggestions([]);
    setShowSuggestions(false);
  }

  const canSubmit = useMemo(() => {
    return Boolean(form.title.trim() && form.startAt.trim());
  }, [form.title, form.startAt]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const isPrivate = form.visibility === "private";

    try {
      // Upload image first if one was selected
      let imageUrl: string | null = null;
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      if (imageFile) {
        const fd = new FormData();
        fd.append("file", imageFile);
        const uploadRes = await fetch("/api/events/upload-image", {
          method: "POST",
          headers: authHeader,
          body: fd,
        });
        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok || !uploadJson?.ok) {
          throw new Error(uploadJson?.error ?? "Image upload failed.");
        }
        imageUrl = uploadJson.url as string;
      }

      const res = await fetch("/api/events/submit", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader },
        body: JSON.stringify({
          ...form,
          sourceUrl: form.sourceUrl.trim() || null,
          venueId: venueId ?? null,
          imageUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Could not submit event.");
      }

      if (isPrivate) {
        router.push(`/events/${json.eventId}`);
      } else {
        setPublicSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit event.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard
  if (!authLoading && !user) {
    return (
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 24,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Submit an event</h2>
        <p style={{ opacity: 0.7 }}>You need to be signed in to submit events.</p>
        <button
          type="button"
          onClick={onSignInRequest}
          style={{
            alignSelf: "start",
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </section>
    );
  }

  if (publicSubmitted) {
    return (
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 24,
          display: "grid",
          gap: 12,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Event submitted for review</h2>
        <p style={{ opacity: 0.7 }}>
          Your event will appear in the public feed once approved.
        </p>
        <button
          type="button"
          onClick={() => {
            setPublicSubmitted(false);
            setForm(initialForm);
            setVenueId(null);
          }}
          style={{
            alignSelf: "start",
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "transparent",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Submit another event
        </button>
      </section>
    );
  }

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Submit an event</h2>
      <p style={{ opacity: 0.7, marginTop: -4 }}>Add a Montréal event manually.</p>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          required
          placeholder="Event title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
        />

        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
        />

        <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Start</span>
            <input
              required
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
            />
          </label>

          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>End (optional)</span>
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
            />
          </label>
        </div>

        <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({ ...f, category: e.target.value as FormState["category"] }))
            }
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
          >
            <option value="music">Music</option>
            <option value="nightlife">Nightlife</option>
            <option value="art">Art</option>
          </select>

          <input
            placeholder="Event Link (tickets, info, or RSVP)"
            value={form.sourceUrl}
            onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
          />
        </div>

        {/* Venue row */}
        <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div ref={venueWrapperRef} style={{ position: "relative" }}>
            <input
              placeholder="Venue name"
              value={form.venueName}
              onChange={(e) => handleVenueNameChange(e.target.value)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 10,
                border: venueId ? "1px solid #16a34a" : "1px solid var(--border-strong)",
              }}
            />
            {showSuggestions && (
              <ul
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  margin: "4px 0 0",
                  padding: 0,
                  listStyle: "none",
                  background: "var(--surface, #fff)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: 10,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                  overflow: "hidden",
                }}
              >
                {suggestions.map((v) => (
                  <li
                    key={v.id}
                    onMouseDown={() => selectVenue(v)}
                    style={{
                      padding: "9px 12px",
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                      fontSize: 14,
                    }}
                    onMouseEnter={(e) =>
                      ((e.currentTarget as HTMLLIElement).style.background =
                        "var(--surface-subtle, #f5f5f5)")
                    }
                    onMouseLeave={(e) =>
                      ((e.currentTarget as HTMLLIElement).style.background = "")
                    }
                  >
                    <span style={{ fontWeight: 600 }}>{v.name}</span>
                    {(v.city || v.address_line1) && (
                      <span style={{ opacity: 0.6, marginLeft: 6 }}>
                        {[v.address_line1, v.city].filter(Boolean).join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <input
            placeholder="Venue address"
            value={form.venueAddress}
            onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
          />
          <input
            placeholder="City"
            value={form.venueCity}
            onChange={(e) => setForm((f) => ({ ...f, venueCity: e.target.value }))}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
          />
        </div>

        {/* Cover image */}
        <div style={{ display: "grid", gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
          />

          {imagePreview ? (
            <div style={{ position: "relative", display: "inline-block" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Cover preview"
                style={{
                  width: "100%",
                  maxHeight: 200,
                  objectFit: "cover",
                  borderRadius: 10,
                  border: "1px solid var(--border-strong)",
                  display: "block",
                }}
              />
              <button
                type="button"
                onClick={() => {
                  handleImageChange(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                style={{
                  position: "absolute",
                  top: 8,
                  right: 8,
                  background: "rgba(0,0,0,0.55)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "3px 8px",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                opacity: 0.7,
                fontSize: 14,
              }}
            >
              + Add cover image (JPG, PNG, WebP · max 5 MB)
            </button>
          )}
        </div>

        {/* Visibility segmented control */}
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "flex",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              overflow: "hidden",
            }}
          >
            {(["public", "private"] as const).map((v, i) => (
              <button
                key={v}
                type="button"
                onClick={() => setForm((f) => ({ ...f, visibility: v }))}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  border: "none",
                  borderLeft: i > 0 ? "1px solid var(--border-strong)" : "none",
                  background:
                    form.visibility === v ? "var(--btn-bg)" : "transparent",
                  fontWeight: form.visibility === v ? 700 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                  textTransform: "capitalize",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {form.visibility === "public"
              ? "Shown in the public feed after moderation."
              : "Not shown in the public feed — accessible only by direct link."}
          </span>
        </div>

        <button
          type="submit"
          disabled={submitting || !canSubmit}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            fontWeight: 700,
            background: submitting || !canSubmit ? "var(--surface-subtle)" : "var(--btn-bg)",
            cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting..." : "Submit event"}
        </button>
      </form>

      {error ? <p style={{ color: "#dc2626" }}>{error}</p> : null}
    </section>
  );
}

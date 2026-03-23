/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useRef, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

export type FormState = {
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
  address: string; // private events: single location text field
};

type VenueSuggestion = {
  id: string;
  name: string;
  city: string | null;
  address_line1: string | null;
};

type HostProfile = { avatar_url: string | null; display_name: string | null };

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
  address: "",
};

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function SubmitEventForm({
  onSignInRequest,
  onClose,
  editEventId,
  initialValues,
  initialImageUrl,
}: {
  onSignInRequest?: () => void;
  onClose?: () => void;
  editEventId?: string;
  initialValues?: Partial<FormState>;
  initialImageUrl?: string | null;
}) {
  const isEditMode = Boolean(editEventId);
  const router = useRouter();
  const { user, loading: authLoading, session } = useAuth();
  const [form, setForm] = useState<FormState>({ ...initialForm, ...initialValues });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSubmitted, setPublicSubmitted] = useState(false);

  // Profile (for avatar + display name in "Hosted by")
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    supabaseBrowser()
      .from("profiles")
      .select("avatar_url,display_name")
      .eq("id", uid)
      .single()
      .then(({ data }) => setHostProfile(data ?? null));
  }, [user]);

  // Venue autocomplete (public events only)
  const [venueId, setVenueId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const venueWrapperRef = useRef<HTMLDivElement>(null);

  // Image upload
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setExistingImageUrl(null);
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
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      let imageUrl: string | null = null;
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
      } else if (isEditMode) {
        imageUrl = existingImageUrl;
      }

      // Build payload — private events omit category, venue breakdown, and source URL
      const basePayload = {
        title: form.title,
        description: form.description,
        startAt: form.startAt,
        endAt: form.endAt,
        visibility: form.visibility,
        imageUrl,
      };

      const payload = isPrivate
        ? {
            ...basePayload,
            category: "music", // not user-selectable for private; API ignores it
            venueName: form.address.trim() || "",
            venueAddress: form.address.trim() || "",
            venueCity: "Montréal",
            venueId: null,
            sourceUrl: null,
          }
        : {
            ...basePayload,
            category: form.category,
            venueName: form.venueName,
            venueAddress: form.venueAddress,
            venueCity: form.venueCity,
            venueId: venueId ?? null,
            sourceUrl: form.sourceUrl.trim() || null,
          };

      const apiUrl = isEditMode ? `/api/events/${editEventId}` : "/api/events/submit";
      const method = isEditMode ? "PATCH" : "POST";
      const res = await fetch(apiUrl, {
        method,
        headers: { "content-type": "application/json", ...authHeader },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? (isEditMode ? "Could not save event." : "Could not submit event."));
      }

      if (isEditMode) {
        onClose?.();
      } else if (isPrivate) {
        onClose?.();
        router.push(`/events/${json.eventId}`);
      } else {
        setPublicSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEditMode ? "Could not save event." : "Could not submit event.");
    } finally {
      setSubmitting(false);
    }
  }

  const fallbackName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "You";
  const displayName = hostProfile?.display_name ?? fallbackName;
  const avatarUrl = hostProfile?.avatar_url ?? null;

  const inputStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border-strong)",
    fontSize: 14,
    background: "transparent",
    color: "inherit",
    width: "100%",
    boxSizing: "border-box",
  };

  // Auth guard
  if (!authLoading && !user) {
    return (
      <div style={{ padding: "20px 20px 24px", display: "grid", gap: 12 }}>
        <p style={{ opacity: 0.7, fontSize: 14 }}>Sign in to create and share events.</p>
        <button
          type="button"
          onClick={onSignInRequest}
          style={{
            alignSelf: "start",
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </div>
    );
  }

  if (publicSubmitted) {
    return (
      <div style={{ padding: "20px 20px 24px", display: "grid", gap: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700 }}>Event submitted for review</h3>
        <p style={{ opacity: 0.7, fontSize: 14, lineHeight: 1.6 }}>
          Your event will appear in the public feed once approved.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              background: "var(--foreground)",
              color: "var(--background)",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => {
              setPublicSubmitted(false);
              setForm(initialForm);
              setVenueId(null);
              setImageFile(null);
              setImagePreview(null);
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              color: "inherit",
            }}
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  const isPrivate = form.visibility === "private";

  return (
    <div style={{ padding: "16px 20px 24px" }}>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>

        {/* 1. Visibility toggle */}
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
                  background: form.visibility === v ? "var(--btn-bg)" : "transparent",
                  fontWeight: form.visibility === v ? 700 : 400,
                  cursor: "pointer",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 7,
                  color: "inherit",
                }}
              >
                {v === "public" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {v === "public" ? "Public event" : "Private event"}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, opacity: 0.5 }}>
            {isPrivate
              ? "Accessible only by direct link — not shown in the public feed."
              : "Shown in the public feed after review."}
          </span>
        </div>

        {/* 2. Hosted by */}
        {user && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "9px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
            }}
          >
            <span style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }}>Hosted by</span>
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: getAvatarColor(displayName),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#fff",
                  flexShrink: 0,
                  userSelect: "none",
                }}
              >
                {getInitials(displayName)}
              </div>
            )}
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {displayName}
            </span>
            <button
              type="button"
              disabled
              title="Coming soon"
              style={{
                padding: "4px 10px",
                borderRadius: 7,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                cursor: "not-allowed",
                fontSize: 12,
                opacity: 0.4,
                flexShrink: 0,
                color: "inherit",
              }}
            >
              + Cohost
            </button>
          </div>
        )}

        {/* 3. Title */}
        <input
          required
          placeholder="Event title"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          style={{ ...inputStyle, fontSize: 16, fontWeight: 500 }}
        />

        {/* 4. Description */}
        <textarea
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        {/* 5. Dates */}
        <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>Start</span>
            <input
              required
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.6 }}>
              End <span style={{ opacity: 0.6 }}>(optional)</span>
            </span>
            <input
              type="datetime-local"
              value={form.endAt}
              onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))}
              style={inputStyle}
            />
          </label>
        </div>

        {/* 6. Public-only: Category + ticket link */}
        {!isPrivate && (
          <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as FormState["category"] }))
              }
              style={inputStyle}
            >
              <option value="music">Music</option>
              <option value="nightlife">Nightlife</option>
              <option value="art">Art</option>
            </select>
            <input
              placeholder="Tickets / info link"
              value={form.sourceUrl}
              onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
              style={inputStyle}
            />
          </div>
        )}

        {/* 7a. Public-only: Venue name / Address / City with autocomplete */}
        {!isPrivate && (
          <div className="col-stack" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div ref={venueWrapperRef} style={{ position: "relative" }}>
              <input
                placeholder="Venue name"
                value={form.venueName}
                onChange={(e) => handleVenueNameChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
                style={{
                  ...inputStyle,
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
                    background: "var(--background)",
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
                        ((e.currentTarget as HTMLLIElement).style.background = "var(--surface-subtle)")
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
              placeholder="Address"
              value={form.venueAddress}
              onChange={(e) => setForm((f) => ({ ...f, venueAddress: e.target.value }))}
              style={inputStyle}
            />
            <input
              placeholder="City"
              value={form.venueCity}
              onChange={(e) => setForm((f) => ({ ...f, venueCity: e.target.value }))}
              style={inputStyle}
            />
          </div>
        )}

        {/* 7b. Private-only: single Address field */}
        {isPrivate && (
          <input
            placeholder="Address (optional)"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            style={inputStyle}
          />
        )}

        {/* 8. Cover image */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
          />
          {(imagePreview ?? existingImageUrl) ? (
            <div style={{ position: "relative" }}>
              <img
                src={imagePreview ?? existingImageUrl!}
                alt="Cover preview"
                style={{
                  width: "100%",
                  maxHeight: 180,
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
                  setExistingImageUrl(null);
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
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px dashed var(--border-strong)",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                opacity: 0.6,
                fontSize: 14,
                color: "inherit",
              }}
            >
              + Add cover image (JPG, PNG, WebP · max 5 MB)
            </button>
          )}
        </div>

        {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}

        {/* 9. Submit */}
        <button
          type="submit"
          disabled={submitting || !canSubmit}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "none",
            fontWeight: 700,
            fontSize: 15,
            background:
              submitting || !canSubmit ? "var(--surface-subtle)" : "var(--foreground)",
            color:
              submitting || !canSubmit ? "inherit" : "var(--background)",
            cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
          }}
        >
          {submitting
            ? isEditMode ? "Saving…" : "Creating…"
            : isEditMode
            ? "Save changes"
            : isPrivate
            ? "Create private event"
            : "Submit for review"}
        </button>
      </form>
    </div>
  );
}

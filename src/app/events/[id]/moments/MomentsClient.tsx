/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import type { MomentRow, SurveyOptionRow } from "./page";

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_EMOJI = ["❤️", "🔥", "👏", "🙌", "✨"] as const;
type ValidEmoji = (typeof VALID_EMOJI)[number];
const BODY_MAX = 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts":     case "music":  return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":                   return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": case "art":    return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":                      return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":                      return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":                      return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:                            return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ReactionGroup = {
  emoji: ValidEmoji;
  count: number;
  isMine: boolean;
};

type DisplayMoment = {
  id: string;
  author_id: string;
  body: string;
  surveyQuestion: string | null;
  surveyOptions: SurveyOptionRow[];
  linkUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkImageUrl: string | null;
  linkSiteName: string | null;
  imageUrl: string | null;
  is_pinned: boolean;
  reactions_enabled: boolean;
  created_at: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
  reactionGroups: ReactionGroup[];
  // raw reactions kept for local mutation
  rawReactions: { user_id: string; emoji: string }[];
  commentCount: number;
  commentsEnabled: boolean;
};

type CommentRow = {
  id: string;
  moment_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
};

// ── Data transforms ───────────────────────────────────────────────────────────

function buildDisplay(row: MomentRow, currentUserId: string | null): DisplayMoment {
  const author = row.profiles
    ? Array.isArray(row.profiles)
      ? (row.profiles[0] ?? null)
      : row.profiles
    : null;

  const rawReactions = row.moment_reactions ?? [];

  const grouped = new Map<string, { count: number; isMine: boolean }>();
  for (const r of rawReactions) {
    const entry = grouped.get(r.emoji) ?? { count: 0, isMine: false };
    entry.count += 1;
    if (r.user_id === currentUserId) entry.isMine = true;
    grouped.set(r.emoji, entry);
  }

  const reactionGroups: ReactionGroup[] = VALID_EMOJI.map((emoji) => {
    const e = grouped.get(emoji);
    return { emoji, count: e?.count ?? 0, isMine: e?.isMine ?? false };
  });

  return {
    id: row.id,
    author_id: row.author_id,
    body: row.body,
    surveyQuestion: (row.survey_question as string | null) ?? null,
    surveyOptions: (row.survey_options as SurveyOptionRow[] | undefined) ?? [],
    linkUrl: (row.link_url as string | null) ?? null,
    linkTitle: (row.link_title as string | null) ?? null,
    linkDescription: (row.link_description as string | null) ?? null,
    linkImageUrl: (row.link_image_url as string | null) ?? null,
    linkSiteName: (row.link_site_name as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    is_pinned: row.is_pinned,
    reactions_enabled: row.reactions_enabled,
    created_at: row.created_at,
    author,
    reactionGroups,
    rawReactions,
    commentCount: row.comment_count ?? 0,
    commentsEnabled: row.comments_enabled !== false,
  };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  url,
  name,
  size = 36,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  return url ? (
    <img
      src={url}
      alt={name ?? ""}
      style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, display: "block",
      }}
    />
  ) : (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: getAvatarColor(name),
        flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.round(size * 0.35), fontWeight: 700, color: "#fff", userSelect: "none",
      }}
    >
      {getInitials(name)}
    </div>
  );
}

// ── Compose area ──────────────────────────────────────────────────────────────

type PostedMoment = {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  survey_question: string | null;
  survey_options: SurveyOptionRow[];
  link_url: string | null;
  link_title: string | null;
  link_description: string | null;
  link_image_url: string | null;
  link_site_name: string | null;
  image_url: string | null;
  is_pinned: boolean;
  reactions_enabled: boolean;
  comments_enabled: boolean;
  created_at: string;
};

// Shared toggle pill used in the confirm step
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        width: "100%", padding: "14px 20px",
        background: "none", border: "none",
        cursor: "pointer", color: "inherit",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          width: 44, height: 26, borderRadius: 13,
          background: checked ? "#a78bfa" : "rgba(255,255,255,0.15)",
          position: "relative", flexShrink: 0,
          transition: "background 0.18s",
          display: "block",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 3, left: checked ? 21 : 3,
            width: 20, height: 20, borderRadius: "50%",
            background: "#fff",
            transition: "left 0.18s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          }}
        />
      </span>
    </button>
  );
}

function ComposeArea({
  eventId,
  isHostOrCohost,
  token,
  onPosted,
}: {
  eventId: string;
  isHostOrCohost: boolean;
  token: string;
  onPosted: (moment: PostedMoment) => void;
}) {
  // step: null = closed, "compose" = step 1, "confirm" = step 2
  const [step, setStep] = useState<null | "compose" | "confirm">(null);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  // Survey
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyOptions, setSurveyOptions] = useState(["", ""]);
  // Link
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  // Image
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Confirm step
  const [reactionsEnabled, setReactionsEnabled] = useState(true);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [isPinned, setIsPinned] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function handleOpen() {
    setStep("compose");
    setTimeout(() => titleRef.current?.focus(), 80);
  }

  function handleClose() {
    setStep(null);
    setTitle("");
    setDetails("");
    setShowSurvey(false);
    setSurveyOptions(["", ""]);
    setLinkUrl("");
    setShowLinkInput(false);
    setLinkError(null);
    setImageUrl(null);
    setImageError(null);
    setReactionsEnabled(true);
    setCommentsEnabled(true);
    setIsPinned(false);
    setError(null);
  }

  function handleAdvance() {
    if (!title.trim()) return;
    // Validate link if entered
    if (linkUrl.trim() && !/^https?:\/\/.{3,}/.test(linkUrl.trim())) {
      setLinkError("Enter a valid URL starting with http:// or https://");
      return;
    }
    // Validate survey if enabled
    if (showSurvey) {
      const filled = surveyOptions.filter((o) => o.trim().length > 0);
      if (filled.length < 2) {
        setError("Add at least 2 survey options.");
        return;
      }
    }
    setLinkError(null);
    setError(null);
    setStep("confirm");
  }

  function handleBack() {
    setStep("compose");
    setError(null);
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImageError(null);
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/events/upload-image", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (data.ok && data.url) {
        setImageUrl(data.url);
      } else {
        setImageError(data.error ?? "Upload failed.");
      }
    } catch {
      setImageError("Network error during upload.");
    } finally {
      setUploadingImage(false);
    }
  }

  async function handlePost() {
    const body = [title.trim(), details.trim()].filter(Boolean).join("\n\n");
    if (!body || submitting) return;
    const finalLink = linkUrl.trim() && /^https?:\/\/.{3,}/.test(linkUrl.trim())
      ? linkUrl.trim()
      : null;
    const filledOptions = surveyOptions.map((o) => o.trim()).filter(Boolean);
    const finalSurveyQuestion = showSurvey && filledOptions.length >= 2 ? title.trim() : null;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/moments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          body,
          survey_question: finalSurveyQuestion,
          survey_options: finalSurveyQuestion ? filledOptions : undefined,
          link_url: finalLink,
          image_url: imageUrl,
          reactions_enabled: reactionsEnabled,
          comments_enabled: commentsEnabled,
          is_pinned: isPinned,
        }),
      });
      const data = (await res.json()) as { ok: boolean; moment?: PostedMoment; error?: string };
      if (data.ok && data.moment) {
        handleClose();
        onPosted(data.moment);
      } else {
        setError(data.error ?? "Failed to post.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  // Shared sheet styles
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 400,
    background: "rgba(0,0,0,0.72)",
    display: "flex", alignItems: "flex-end", justifyContent: "center",
  };
  const sheetStyle: React.CSSProperties = {
    background: "#111110",
    color: "#eae8e4",
    borderRadius: "20px 20px 0 0",
    width: "100%",
    maxWidth: 540,
    display: "flex",
    flexDirection: "column",
    // Take most of the screen — composer feels like a real creation surface
    minHeight: "90dvh",
    maxHeight: "96dvh",
    overflow: "hidden",
  };
  const sheetHeaderStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 16px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    flexShrink: 0,
  };
  const iconBtnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    border: "none", cursor: "pointer", color: "inherit",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };

  return (
    <>
      {/* Hidden file input for image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleImagePick}
      />

      {/* Trigger button */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          padding: "28px 16px 24px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer",
          textAlign: "center",
          color: "rgba(255,255,255,0.50)",
        }}
      >
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="16" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 500 }}>Share a moment</span>
      </button>

      {/* ── Step 1: Composer ── */}
      {step === "compose" && createPortal(
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div style={sheetStyle}>
            {/* Header */}
            <div style={sheetHeaderStyle}>
              <button type="button" onClick={handleClose} style={iconBtnStyle} aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Share a moment</span>
              <button
                type="button"
                onClick={handleAdvance}
                disabled={!title.trim()}
                aria-label="Next"
                style={{
                  ...iconBtnStyle,
                  background: title.trim() ? "#a78bfa" : "rgba(255,255,255,0.08)",
                  opacity: title.trim() ? 1 : 0.45,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </button>
            </div>

            {/* Fields — flex-grow to fill space */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 0 }}>
              <input
                ref={titleRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's happening?"
                maxLength={200}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "transparent", border: "none",
                  outline: "none", color: "inherit",
                  fontSize: 20, fontWeight: 600,
                  fontFamily: "inherit", lineHeight: 1.3,
                  marginBottom: 16,
                  caretColor: "#a78bfa",
                }}
              />
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Add details… (optional)"
                maxLength={BODY_MAX}
                rows={6}
                style={{
                  width: "100%", boxSizing: "border-box",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 12,
                  outline: "none", color: "inherit",
                  fontSize: 16, lineHeight: 1.55,
                  resize: "none", fontFamily: "inherit",
                  padding: "12px 14px",
                  caretColor: "#a78bfa",
                  flex: 1,
                }}
              />
              {details.length > BODY_MAX * 0.85 && (
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.45, textAlign: "right" }}>
                  {details.length}/{BODY_MAX}
                </div>
              )}

              {/* Link input — shown when toggled */}
              {showLinkInput && (
                <div style={{ marginTop: 14 }}>
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => { setLinkUrl(e.target.value); setLinkError(null); }}
                    placeholder="https://…"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "rgba(255,255,255,0.05)",
                      border: linkError ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.09)",
                      borderRadius: 12, outline: "none",
                      color: "inherit", fontSize: 16,
                      fontFamily: "inherit", padding: "11px 14px",
                      caretColor: "#a78bfa",
                    }}
                  />
                  {linkError && (
                    <div style={{ marginTop: 5, fontSize: 12, color: "#ef4444" }}>{linkError}</div>
                  )}
                </div>
              )}

              {/* Image preview */}
              {imageUrl && (
                <div style={{ marginTop: 14, position: "relative" }}>
                  <img
                    src={imageUrl}
                    alt="Attached image"
                    style={{
                      width: "100%", borderRadius: 12,
                      maxHeight: 220, objectFit: "cover",
                      display: "block",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    aria-label="Remove image"
                    style={{
                      position: "absolute", top: 8, right: 8,
                      width: 28, height: 28, borderRadius: "50%",
                      background: "rgba(0,0,0,0.65)",
                      border: "none", cursor: "pointer", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              )}
              {imageError && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{imageError}</div>
              )}

              {/* Survey builder */}
              {showSurvey && (
                <div style={{ marginTop: 14 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, opacity: 0.45,
                    textTransform: "uppercase", letterSpacing: "0.07em",
                    marginBottom: 8,
                  }}>
                    Survey options
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {surveyOptions.map((opt, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...surveyOptions];
                            next[i] = e.target.value;
                            setSurveyOptions(next);
                          }}
                          placeholder={`Option ${i + 1}`}
                          maxLength={200}
                          style={{
                            flex: 1, boxSizing: "border-box",
                            background: "rgba(255,255,255,0.05)",
                            border: "1px solid rgba(255,255,255,0.09)",
                            borderRadius: 10, outline: "none",
                            color: "inherit", fontSize: 16,
                            fontFamily: "inherit", padding: "10px 12px",
                            caretColor: "#a78bfa",
                          }}
                        />
                        {surveyOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setSurveyOptions(surveyOptions.filter((_, j) => j !== i))}
                            aria-label="Remove option"
                            style={{
                              width: 28, height: 28, borderRadius: "50%",
                              background: "rgba(255,255,255,0.07)",
                              border: "none", cursor: "pointer", color: "rgba(255,255,255,0.45)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {surveyOptions.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setSurveyOptions([...surveyOptions, ""])}
                      style={{
                        marginTop: 8, display: "flex", alignItems: "center", gap: 6,
                        background: "none", border: "none", cursor: "pointer",
                        color: "#a78bfa", fontSize: 13, fontWeight: 500, padding: 0,
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Add option
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Tools row */}
            <div style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}>
              {/* Link tool */}
              <button
                type="button"
                onClick={() => setShowLinkInput((v) => !v)}
                aria-label="Add link"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: showLinkInput ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.06)",
                  color: showLinkInput ? "#a78bfa" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
                {linkUrl.trim() ? "Link added" : "Link"}
              </button>

              {/* Image tool */}
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={uploadingImage}
                aria-label="Add image"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: imageUrl ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.06)",
                  color: imageUrl ? "#a78bfa" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 500,
                  cursor: uploadingImage ? "wait" : "pointer",
                  opacity: uploadingImage ? 0.6 : 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
                {uploadingImage ? "Uploading…" : imageUrl ? "Image added" : "Image"}
              </button>

              {/* Survey tool */}
              <button
                type="button"
                onClick={() => {
                  setShowSurvey((v) => !v);
                  if (!showSurvey) setSurveyOptions(["", ""]);
                }}
                aria-label="Add survey"
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 12px", borderRadius: 20,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: showSurvey ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.06)",
                  color: showSurvey ? "#a78bfa" : "rgba(255,255,255,0.55)",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/>
                </svg>
                Survey
              </button>
            </div>

            {/* Bottom safe area */}
            <div style={{ height: "max(8px, env(safe-area-inset-bottom))", flexShrink: 0 }} />
          </div>
        </div>,
        document.body
      )}

      {/* ── Step 2: Confirm options ── */}
      {step === "confirm" && createPortal(
        <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && handleClose()}>
          <div style={{ ...sheetStyle, minHeight: "auto", maxHeight: "80dvh" }}>
            {/* Header */}
            <div style={sheetHeaderStyle}>
              <button type="button" onClick={handleBack} style={iconBtnStyle} aria-label="Back">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6"/>
                </svg>
              </button>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Post options</span>
              <div style={{ width: 36 }} />
            </div>

            {/* Preview */}
            <div style={{
              padding: "14px 20px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.9, lineHeight: 1.3 }}>
                {title}
              </div>
              {details.trim() && (
                <div style={{
                  fontSize: 13, opacity: 0.45, marginTop: 4, lineHeight: 1.4,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                }}>
                  {details}
                </div>
              )}
              {(linkUrl.trim() || imageUrl || (showSurvey && surveyOptions.filter((o) => o.trim()).length >= 2)) && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {showSurvey && surveyOptions.filter((o) => o.trim()).length >= 2 && (
                    <span style={{
                      fontSize: 12, padding: "3px 8px", borderRadius: 20,
                      background: "rgba(167,139,250,0.12)",
                      border: "1px solid rgba(167,139,250,0.25)",
                      color: "#a78bfa",
                    }}>
                      {surveyOptions.filter((o) => o.trim()).length} survey options
                    </span>
                  )}
                  {linkUrl.trim() && (
                    <span style={{
                      fontSize: 12, padding: "3px 8px", borderRadius: 20,
                      background: "rgba(167,139,250,0.12)",
                      border: "1px solid rgba(167,139,250,0.25)",
                      color: "#a78bfa",
                    }}>
                      Link attached
                    </span>
                  )}
                  {imageUrl && (
                    <span style={{
                      fontSize: 12, padding: "3px 8px", borderRadius: 20,
                      background: "rgba(167,139,250,0.12)",
                      border: "1px solid rgba(167,139,250,0.25)",
                      color: "#a78bfa",
                    }}>
                      Image attached
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Toggles */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              <Toggle checked={reactionsEnabled} onChange={setReactionsEnabled} label="Allow reactions" />
              <Toggle checked={commentsEnabled} onChange={setCommentsEnabled} label="Allow comments" />
              {isHostOrCohost && (
                <Toggle checked={isPinned} onChange={setIsPinned} label="Pin to top" />
              )}
            </div>

            {/* Error */}
            {error && (
              <div style={{ padding: "8px 20px 0", fontSize: 13, color: "#ef4444", flexShrink: 0 }}>
                {error}
              </div>
            )}

            {/* Post button */}
            <div style={{ padding: "16px 20px", paddingBottom: "max(20px, env(safe-area-inset-bottom))", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => void handlePost()}
                disabled={submitting}
                style={{
                  width: "100%", padding: "15px",
                  borderRadius: 14, border: "none",
                  background: submitting ? "rgba(167,139,250,0.45)" : "#a78bfa",
                  color: "#fff", fontSize: 16, fontWeight: 700,
                  cursor: submitting ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {submitting ? "Posting…" : "Post moment"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Reaction picker ────────────────────────────────────────────────────────────

function ReactionPicker({
  reactionGroups,
  canReact,
  onReact,
}: {
  reactionGroups: ReactionGroup[];
  canReact: boolean;
  onReact: (emoji: ValidEmoji) => void;
}) {
  const [open, setOpen] = useState(false);
  const myReaction = reactionGroups.find((g) => g.isMine);
  const hasReactions = reactionGroups.some((g) => g.count > 0);

  function handlePick(emoji: ValidEmoji) {
    onReact(emoji);
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {/* React button + picker popup */}
      {canReact && (
        <div style={{ position: "relative" }}>
          {open && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 10 }}
                onClick={() => setOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: 0,
                  zIndex: 20,
                  background: "rgba(28,28,28,0.97)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 28,
                  padding: "6px 8px",
                  display: "flex",
                  gap: 2,
                  boxShadow: "0 6px 24px rgba(0,0,0,0.55)",
                }}
              >
                {VALID_EMOJI.map((emoji) => {
                  const isMine = reactionGroups.find((g) => g.emoji === emoji)?.isMine ?? false;
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handlePick(emoji)}
                      style={{
                        width: 38, height: 38, borderRadius: "50%",
                        border: "none",
                        background: isMine ? "rgba(167,139,250,0.22)" : "transparent",
                        cursor: "pointer", fontSize: 20,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "background 0.1s, transform 0.1s",
                      }}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "4px 10px", borderRadius: 20,
              border: myReaction
                ? "1px solid rgba(167,139,250,0.50)"
                : "1px solid rgba(255,255,255,0.12)",
              background: myReaction
                ? "rgba(167,139,250,0.12)"
                : "rgba(255,255,255,0.05)",
              color: myReaction ? "inherit" : "rgba(255,255,255,0.55)",
              fontSize: 13, cursor: "pointer",
              transition: "background 0.12s, border-color 0.12s",
            }}
          >
            {myReaction ? (
              <span style={{ fontSize: 16, lineHeight: 1 }}>{myReaction.emoji}</span>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
                  <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth="3"/>
                  <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth="3"/>
                </svg>
                <span>React</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Reaction summary — only non-zero counts */}
      {hasReactions && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {reactionGroups.filter((g) => g.count > 0).map(({ emoji, count, isMine }) => (
            <span
              key={emoji}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                padding: "3px 8px", borderRadius: 20, fontSize: 12,
                background: isMine ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.06)",
                border: isMine ? "1px solid rgba(167,139,250,0.28)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span>{emoji}</span>
              <span style={{ fontWeight: 600, opacity: 0.75 }}>{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline comments ────────────────────────────────────────────────────────────

const COMMENTS_PREVIEW = 2;

function InlineComments({
  momentId,
  eventId,
  token,
  currentUserId,
  isHostOrCohost,
}: {
  momentId: string;
  eventId: string;
  token: string | null;
  currentUserId: string | null;
  isHostOrCohost: boolean;
}) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/events/${eventId}/moments/${momentId}/comments`)
      .then((r) => r.json())
      .then((data: { ok: boolean; comments?: CommentRow[]; error?: string }) => {
        if (data.ok && data.comments) setComments(data.comments);
        else if (!data.ok) {
          console.error("[InlineComments] load failed:", data.error);
          setLoadError(data.error ?? "Failed to load comments.");
        }
      })
      .catch((err) => {
        console.error("[InlineComments] network error:", err);
        setLoadError("Network error.");
      })
      .finally(() => setLoading(false));
  }, [momentId, eventId]);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending || !token) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/moments/${momentId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: trimmed }),
      });
      const data = (await res.json()) as { ok: boolean; comment?: CommentRow; error?: string };
      if (data.ok && data.comment) {
        setComments((prev) => [...prev, data.comment!]);
        setText("");
        setExpanded(true);
      } else {
        setSendError(data.error ?? "Failed to send.");
      }
    } catch {
      setSendError("Network error.");
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!token || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/moments/${momentId}/comments/${commentId}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        console.error("[InlineComments] delete failed:", data.error);
      }
    } catch (err) {
      console.error("[InlineComments] delete network error:", err);
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const visible = expanded ? comments : comments.slice(0, COMMENTS_PREVIEW);
  const hiddenCount = comments.length - COMMENTS_PREVIEW;

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {loading && (
        <p style={{ fontSize: 12, opacity: 0.35, margin: "0 0 8px" }}>Loading…</p>
      )}
      {!loading && loadError && (
        <p style={{ fontSize: 12, color: "#ef4444", margin: "0 0 8px" }}>{loadError}</p>
      )}

      {/* Thread */}
      {!loading && visible.length > 0 && (
        <div
          style={{
            borderLeft: "2px solid rgba(255,255,255,0.10)",
            marginLeft: 4,
            paddingLeft: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            marginBottom: 10,
          }}
        >
          {visible.map((c) => {
            const name = c.author?.display_name ?? c.author?.username ?? "Someone";
            const canDelete = token && (currentUserId === c.user_id || isHostOrCohost);
            const confirming = confirmDeleteId === c.id;
            return (
              <div key={c.id} style={{ display: "flex", gap: 8 }}>
                <Avatar url={c.author?.avatar_url ?? null} name={name} size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{name}</span>
                    <span style={{ fontSize: 11, opacity: 0.35 }}>{relativeTime(c.created_at)}</span>
                    {canDelete && !confirming && (
                      <div style={{ marginLeft: "auto", position: "relative" }}>
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                          aria-label="Comment actions"
                          style={{
                            background: "none", border: "none",
                            cursor: "pointer", padding: "0 4px",
                            color: "rgba(255,255,255,0.28)",
                            display: "flex", alignItems: "center",
                            lineHeight: 1, fontSize: 14, letterSpacing: "0.06em",
                          }}
                        >
                          •••
                        </button>
                        {openMenuId === c.id && (
                          <>
                            <div style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setOpenMenuId(null)} />
                            <div style={{
                              position: "absolute", right: 0, top: "calc(100% + 4px)",
                              zIndex: 20,
                              background: "rgba(24,24,24,0.97)",
                              backdropFilter: "blur(16px)",
                              WebkitBackdropFilter: "blur(16px)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              borderRadius: 10,
                              overflow: "hidden",
                              boxShadow: "0 4px 18px rgba(0,0,0,0.50)",
                              minWidth: 148,
                            }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setConfirmDeleteId(c.id);
                                }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8,
                                  width: "100%", padding: "10px 14px",
                                  background: "none", border: "none",
                                  cursor: "pointer", color: "#ef4444",
                                  fontSize: 13, fontWeight: 500,
                                  textAlign: "left",
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                                Delete comment
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {confirming && (
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 11, opacity: 0.55 }}>Delete?</span>
                        <button
                          type="button"
                          onClick={() => void handleDelete(c.id)}
                          disabled={deleting}
                          style={{
                            fontSize: 11, fontWeight: 700, color: "#ef4444",
                            background: "none", border: "none", cursor: "pointer", padding: 0,
                          }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          style={{
                            fontSize: 11, color: "rgba(255,255,255,0.40)",
                            background: "none", border: "none", cursor: "pointer", padding: 0,
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, opacity: 0.82, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {c.body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* See more */}
      {!loading && !expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 12, fontWeight: 600,
            color: "rgba(255,255,255,0.40)",
            padding: "0 0 8px",
          }}
        >
          See {hiddenCount} more {hiddenCount === 1 ? "comment" : "comments"}
        </button>
      )}

      {/* Input */}
      {token ? (
        <div>
          {sendError && (
            <p style={{ fontSize: 11, color: "#ef4444", margin: "0 0 4px" }}>{sendError}</p>
          )}
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a comment…"
              rows={1}
              maxLength={1000}
              style={{
                flex: 1,
                padding: "7px 12px",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                fontSize: 16,
                lineHeight: 1.4,
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                minHeight: 36,
                maxHeight: 100,
                overflowY: "auto",
                boxSizing: "border-box",
              }}
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!text.trim() || sending}
              style={{
                width: 34, height: 34, borderRadius: "50%",
                border: "none",
                background: !text.trim() || sending ? "rgba(94,168,255,0.20)" : "#5EA8FF",
                color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: !text.trim() || sending ? "not-allowed" : "pointer",
                flexShrink: 0,
                transition: "background 0.15s",
              }}
              aria-label="Send comment"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
          style={{
            fontSize: 12, color: "rgba(255,255,255,0.40)",
            background: "none", border: "none", cursor: "pointer",
            padding: 0, textDecoration: "underline",
          }}
        >
          Sign in to comment
        </button>
      )}
    </div>
  );
}

// ── Survey block ─────────────────────────────────────────────────────────────

function SurveyBlock({
  momentId,
  eventId,
  question,
  options,
  currentUserId,
  token,
}: {
  momentId: string;
  eventId: string;
  question: string;
  options: SurveyOptionRow[];
  currentUserId: string | null;
  token: string | null;
}) {
  const myVotedOptionId = currentUserId
    ? options.find((o) => o.votes.some((v) => v.user_id === currentUserId))?.id ?? null
    : null;
  const hasVoted = myVotedOptionId !== null;

  // Local optimistic state: map option_id → vote count + whether I voted
  const [localOptions, setLocalOptions] = useState<SurveyOptionRow[]>(options);
  const [voting, setVoting] = useState(false);

  // Sync when props change (e.g. background fetchMoments)
  useEffect(() => {
    setLocalOptions(options);
  }, [options]);

  const localTotal = localOptions.reduce((s, o) => s + o.votes.length, 0);

  async function handleVote(optionId: string) {
    if (!token || voting) return;
    const myPrevVote = currentUserId
      ? localOptions.find((o) => o.votes.some((v) => v.user_id === currentUserId))?.id ?? null
      : null;

    // Optimistic update
    setLocalOptions((prev) =>
      prev.map((o) => {
        if (o.id === myPrevVote && myPrevVote !== optionId) {
          // Remove old vote
          return { ...o, votes: o.votes.filter((v) => v.user_id !== currentUserId) };
        }
        if (o.id === optionId) {
          if (myPrevVote === optionId) {
            // Toggle off
            return { ...o, votes: o.votes.filter((v) => v.user_id !== currentUserId) };
          }
          // Add vote
          return { ...o, votes: [...o.votes, { user_id: currentUserId! }] };
        }
        return o;
      })
    );

    setVoting(true);
    try {
      await fetch(`/api/events/${eventId}/moments/${momentId}/survey-vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ option_id: optionId }),
      });
    } finally {
      setVoting(false);
    }
  }

  const localMyVote = currentUserId
    ? localOptions.find((o) => o.votes.some((v) => v.user_id === currentUserId))?.id ?? null
    : null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, lineHeight: 1.3 }}>
        {question}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {localOptions.map((opt) => {
          const count = opt.votes.length;
          const pct = localTotal > 0 ? Math.round((count / localTotal) * 100) : 0;
          const isSelected = localMyVote === opt.id;
          const showResults = hasVoted || localMyVote !== null;

          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => void handleVote(opt.id)}
              disabled={voting || !token}
              style={{
                position: "relative", overflow: "hidden",
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", borderRadius: 10,
                border: isSelected
                  ? "1px solid rgba(167,139,250,0.55)"
                  : "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.04)",
                cursor: token && !voting ? "pointer" : "default",
                color: "inherit", textAlign: "left",
                transition: "border-color 0.15s",
              }}
            >
              {/* Fill bar */}
              {showResults && (
                <span style={{
                  position: "absolute", inset: 0, right: `${100 - pct}%`,
                  background: isSelected ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.05)",
                  transition: "right 0.3s ease",
                  pointerEvents: "none",
                }} />
              )}
              <span style={{ position: "relative", fontSize: 14, fontWeight: isSelected ? 600 : 400 }}>
                {opt.text}
              </span>
              {showResults && (
                <span style={{
                  position: "relative", fontSize: 12, fontWeight: 600,
                  color: isSelected ? "#a78bfa" : "rgba(255,255,255,0.40)",
                  flexShrink: 0, marginLeft: 8,
                }}>
                  {pct}%
                </span>
              )}
            </button>
          );
        })}
      </div>
      {localTotal > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.35 }}>
          {localTotal} {localTotal === 1 ? "vote" : "votes"}
        </div>
      )}
    </div>
  );
}

// ── Moment card ────────────────────────────────────────────────────────────────

function MomentCard({
  moment,
  eventId,
  currentUserId,
  isHostOrCohost,
  guestsCanReact,
  token,
  highlighted,
  onDeleted,
  onPinToggled,
  onReactionToggle,
}: {
  moment: DisplayMoment;
  eventId: string;
  currentUserId: string | null;
  isHostOrCohost: boolean;
  guestsCanReact: boolean;
  token: string | null;
  highlighted: boolean;
  onDeleted: (id: string) => void;
  onPinToggled: (id: string, pinned: boolean) => void;
  onReactionToggle: (momentId: string, emoji: ValidEmoji, add: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Scroll into view when highlighted via deep-link
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);

  const authorName = moment.author?.display_name ?? moment.author?.username ?? "Unknown";
  const canManage =
    isHostOrCohost || (currentUserId != null && currentUserId === moment.author_id);
  const canReact =
    currentUserId != null && (isHostOrCohost || guestsCanReact) && moment.reactions_enabled;

  async function handleDelete() {
    if (!token || deleting) return;
    setDeleting(true);
    setMenuOpen(false);
    try {
      await fetch(`/api/events/${eventId}/moments/${moment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      onDeleted(moment.id);
    } catch {
      setDeleting(false);
    }
  }

  async function handlePinToggle() {
    if (!token) return;
    setMenuOpen(false);
    const newPinned = !moment.is_pinned;
    onPinToggled(moment.id, newPinned);
    await fetch(`/api/events/${eventId}/moments/${moment.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ is_pinned: newPinned }),
    });
  }

  async function handleReaction(emoji: ValidEmoji) {
    if (!token || !canReact) return;
    const group = moment.reactionGroups.find((g) => g.emoji === emoji);
    const adding = !group?.isMine;
    onReactionToggle(moment.id, emoji, adding);
    const method = adding ? "POST" : "DELETE";
    await fetch(`/api/events/${eventId}/moments/${moment.id}/reactions`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ emoji }),
    });
  }

  return (
    <div
      ref={ref}
      style={{
        borderRadius: 16,
        background: highlighted
          ? "rgba(167,139,250,0.10)"
          : "rgba(255,255,255,0.05)",
        border: highlighted
          ? "1px solid rgba(167,139,250,0.35)"
          : "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        padding: "14px 16px",
        transition: "background 0.3s, border-color 0.3s",
      }}
    >
      {/* Pinned label */}
      {moment.is_pinned && (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 11, fontWeight: 700, opacity: 0.55,
            textTransform: "uppercase", letterSpacing: "0.07em",
            marginBottom: 10,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M16 9V4l1 0a2 2 0 0 0 0-4H7a2 2 0 0 0 0 4l1 0v5c0 1.1-.9 2-2 2H4v2h7v7l1 1 1-1v-7h7v-2h-2a2 2 0 0 1-2-2z"/>
          </svg>
          Pinned
        </div>
      )}

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <Avatar url={moment.author?.avatar_url ?? null} name={authorName} size={32} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{authorName}</div>
          <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1 }}>
            {relativeTime(moment.created_at)}
          </div>
        </div>

        {/* Context menu — author or host */}
        {canManage && !deleting && (
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "inherit", opacity: 0.45, padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/>
              </svg>
            </button>

            {menuOpen && (
              <>
                {/* Backdrop to close menu */}
                <div
                  style={{ position: "fixed", inset: 0, zIndex: 10 }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  style={{
                    position: "absolute", right: 0, top: "100%", zIndex: 20,
                    background: "var(--background, #0e0807)",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: 12, overflow: "hidden",
                    minWidth: 150,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  }}
                >
                  {isHostOrCohost && (
                    <button
                      type="button"
                      onClick={handlePinToggle}
                      style={{
                        display: "block", width: "100%", padding: "11px 16px",
                        background: "transparent", border: "none",
                        textAlign: "left", fontSize: 14, cursor: "pointer",
                        color: "inherit",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {moment.is_pinned ? "Unpin" : "Pin to top"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{
                      display: "block", width: "100%", padding: "11px 16px",
                      background: "transparent", border: "none",
                      textAlign: "left", fontSize: 14, cursor: "pointer",
                      color: "#ef4444",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {deleting && (
          <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>Deleting…</span>
        )}
      </div>

      {/* Body — first paragraph is the title (bold), rest is details */}
      {(() => {
        const [momentTitle, ...rest] = moment.body.split("\n\n");
        const momentDetails = rest.join("\n\n");
        return (
          <div style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {momentTitle}
            </p>
            {momentDetails && (
              <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: 1.55, opacity: 0.72, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {momentDetails}
              </p>
            )}
          </div>
        );
      })()}

      {/* Survey */}
      {moment.surveyQuestion && moment.surveyOptions.length >= 2 && (
        <SurveyBlock
          momentId={moment.id}
          eventId={eventId}
          question={moment.surveyQuestion}
          options={moment.surveyOptions}
          currentUserId={currentUserId}
          token={token}
        />
      )}

      {/* Image attachment */}
      {moment.imageUrl && (
        <div style={{ marginBottom: 12 }}>
          <img
            src={moment.imageUrl}
            alt=""
            style={{
              width: "100%", borderRadius: 10,
              maxHeight: 320, objectFit: "cover",
              display: "block",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        </div>
      )}

      {/* Link preview card */}
      {moment.linkUrl && (
        <a
          href={moment.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block", marginBottom: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            overflow: "hidden",
            textDecoration: "none", color: "inherit",
          }}
        >
          {/* OG image thumbnail */}
          {moment.linkImageUrl && (
            <img
              src={moment.linkImageUrl}
              alt=""
              style={{
                width: "100%", display: "block",
                height: 160, objectFit: "cover",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            />
          )}
          <div style={{ padding: "10px 12px 11px" }}>
            {/* Site name */}
            <div style={{
              fontSize: 11, fontWeight: 600, opacity: 0.45,
              textTransform: "uppercase", letterSpacing: "0.06em",
              marginBottom: 4,
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
            }}>
              {moment.linkSiteName ??
                (() => { try { return new URL(moment.linkUrl!).hostname.replace(/^www\./, ""); } catch { return moment.linkUrl; } })()}
            </div>
            {/* Title */}
            {(moment.linkTitle ?? moment.linkUrl) && (
              <div style={{
                fontSize: 13, fontWeight: 600, lineHeight: 1.35,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                marginBottom: moment.linkDescription ? 4 : 0,
              }}>
                {moment.linkTitle ?? moment.linkUrl}
              </div>
            )}
            {/* Description */}
            {moment.linkDescription && (
              <div style={{
                fontSize: 12, opacity: 0.55, lineHeight: 1.4,
                overflow: "hidden", display: "-webkit-box",
                WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {moment.linkDescription}
              </div>
            )}
          </div>
        </a>
      )}

      {/* Reactions */}
      {moment.reactions_enabled && (
        <ReactionPicker
          reactionGroups={moment.reactionGroups}
          canReact={canReact}
          onReact={handleReaction}
        />
      )}

      {/* Inline comments */}
      {moment.commentsEnabled && (
        <InlineComments
          momentId={moment.id}
          eventId={eventId}
          token={token}
          currentUserId={currentUserId}
          isHostOrCohost={isHostOrCohost}
        />
      )}
    </div>
  );
}

// ── Main client component ──────────────────────────────────────────────────────

export function MomentsClient({
  eventId,
  eventTitle,
  eventImageUrl,
  eventCategory,
  creatorId,
  cohostIds,
  guestsCanPost,
  guestsCanReact,
  initialMoments,
  embedded = false,
}: {
  eventId: string;
  eventTitle: string;
  eventImageUrl: string | null;
  eventCategory: string;
  creatorId: string | null;
  cohostIds: string[];
  guestsCanPost: boolean;
  guestsCanReact: boolean;
  initialMoments: MomentRow[];
  /** When true, skip the outer main/ambient/nav/tabs — parent provides the shell */
  embedded?: boolean;
}) {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const deepLinkedMomentId = searchParams.get("moment");

  const isHostOrCohost =
    user != null &&
    (user.id === creatorId || cohostIds.includes(user.id));

  const canPost = isHostOrCohost || (user != null && guestsCanPost);

  const [moments, setMoments] = useState<DisplayMoment[]>(() =>
    initialMoments.map((m) => buildDisplay(m, user?.id ?? null))
  );
  // When user identity resolves, update only the isMine flags on existing moments.
  // Do NOT reset to initialMoments — that would overwrite any moments loaded by
  // fetchMoments() after a post, causing recently created moments to disappear.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoments((prev) =>
      prev.map((m) => ({
        ...m,
        reactionGroups: VALID_EMOJI.map((emoji) => ({
          emoji,
          count: m.rawReactions.filter((r) => r.emoji === emoji).length,
          isMine: m.rawReactions.some((r) => r.emoji === emoji && r.user_id === (user?.id ?? null)),
        })),
      }))
    );
  }, [user?.id]);

  const userId = user?.id ?? null;

  const fetchMoments = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/moments`, {
        // Bypass browser/CDN cache — always read latest rows from Supabase.
        cache: "no-store",
      });
      const data = (await res.json()) as { ok: boolean; moments?: MomentRow[]; error?: string };
      if (data.ok && data.moments) {
        setMoments((prev) => {
          const serverMoments = data.moments!.map((m) => buildDisplay(m, userId));
          const serverIds = new Set(serverMoments.map((m) => m.id));
          // Preserve any optimistic moments not yet confirmed by the server
          // (guards against race condition where the GET runs before INSERT is visible)
          const optimisticOnly = prev.filter((m) => !serverIds.has(m.id));
          const merged = [...serverMoments, ...optimisticOnly];
          return merged.sort((a, b) => {
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
        });
      } else if (!data.ok) {
        console.error("[fetchMoments] API error:", data.error);
      }
    } catch (err) {
      console.error("[fetchMoments] network error:", err);
    }
  // userId is a stable primitive derived from user?.id — safe dep
  }, [eventId, userId]);

  // On mount, immediately fetch fresh moments from the API to override any stale
  // initialMoments that the server may have delivered (router cache, data cache,
  // or brief Supabase replication lag can all cause initialMoments to lag behind).
  // Guard with a ref so auth-driven fetchMoments recreations don't cause extra fetches.
  const fetchedOnMount = useRef(false);
  useEffect(() => {
    if (fetchedOnMount.current) return;
    fetchedOnMount.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMoments();
  }, [fetchMoments]);

  function handlePosted(newMoment: PostedMoment) {
    // Optimistically prepend so it appears immediately
    const optimistic: DisplayMoment = {
      id: newMoment.id,
      author_id: newMoment.author_id,
      body: newMoment.body,
      surveyQuestion: newMoment.survey_question ?? null,
      surveyOptions: newMoment.survey_options ?? [],
      linkUrl: newMoment.link_url ?? null,
      linkTitle: newMoment.link_title ?? null,
      linkDescription: newMoment.link_description ?? null,
      linkImageUrl: newMoment.link_image_url ?? null,
      linkSiteName: newMoment.link_site_name ?? null,
      imageUrl: newMoment.image_url ?? null,
      is_pinned: newMoment.is_pinned,
      reactions_enabled: newMoment.reactions_enabled,
      created_at: newMoment.created_at,
      author: null,
      reactionGroups: VALID_EMOJI.map((emoji) => ({ emoji, count: 0, isMine: false })),
      rawReactions: [],
      commentCount: 0,
      commentsEnabled: newMoment.comments_enabled !== false,
    };
    setMoments((prev) => {
      const unpinned = newMoment.is_pinned
        ? prev.map((m) => ({ ...m, is_pinned: false }))
        : prev;
      return [optimistic, ...unpinned];
    });
    // Background refetch to populate author profiles
    fetchMoments();
  }

  function handleDeleted(id: string) {
    setMoments((prev) => prev.filter((m) => m.id !== id));
  }

  function handlePinToggled(id: string, pinned: boolean) {
    setMoments((prev) =>
      prev.map((m) => {
        if (m.id === id) return { ...m, is_pinned: pinned };
        if (pinned && m.is_pinned) return { ...m, is_pinned: false };
        return m;
      })
      .sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
    );
  }

  function handleReactionToggle(momentId: string, emoji: ValidEmoji, add: boolean) {
    setMoments((prev) =>
      prev.map((m) => {
        if (m.id !== momentId) return m;
        const groups = m.reactionGroups.map((g) => {
          if (g.emoji !== emoji) return g;
          return {
            ...g,
            count: add ? g.count + 1 : Math.max(0, g.count - 1),
            isMine: add,
          };
        });
        return { ...m, reactionGroups: groups };
      })
    );
  }

  const isEmpty = moments.length === 0;

  const content = (
    <div
      style={{
        color: "#eae8e4",
        "--border": "rgba(255,255,255,0.10)",
        "--border-strong": "rgba(255,255,255,0.18)",
        "--btn-bg": "rgba(255,255,255,0.07)",
        "--surface-raised": "rgba(255,255,255,0.08)",
        "--background": "rgba(20,11,7,0.55)",
        "--foreground": "#eae8e4",
        "--accent": "#a78bfa",
      } as React.CSSProperties}
    >
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 80px" }}>

        {/* Compose — visible to users who can post */}
        {canPost && session && (
          <div style={{ marginBottom: 20 }}>
            <ComposeArea
              eventId={eventId}
              isHostOrCohost={isHostOrCohost}
              token={session.access_token}
              onPosted={handlePosted}
            />
          </div>
        )}

        {/* Sign-in nudge for guests who can't post */}
        {!user && (
          <div style={{ marginBottom: 20, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
              style={{
                fontSize: 13, opacity: 0.5, background: "none",
                border: "none", cursor: "pointer", color: "inherit",
                textDecoration: "underline",
              }}
            >
              Sign in to react or post
            </button>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div style={{ padding: "64px 0", textAlign: "center" }}>
            <div style={{ opacity: 0.15, marginBottom: 16, display: "flex", justifyContent: "center" }}>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, opacity: 0.55, margin: "0 0 6px" }}>
              No moments yet
            </p>
            <p style={{ fontSize: 13, opacity: 0.35, margin: 0 }}>
              {isHostOrCohost
                ? "Share updates, hype, and reminders with your attendees."
                : "The host hasn't posted anything yet."}
            </p>
          </div>
        )}

        {/* Moments list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {moments.map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              eventId={eventId}
              currentUserId={user?.id ?? null}
              isHostOrCohost={isHostOrCohost}
              guestsCanReact={guestsCanReact}
              token={session?.access_token ?? null}
              highlighted={moment.id === deepLinkedMomentId}
              onDeleted={handleDeleted}
              onPinToggled={handlePinToggled}
              onReactionToggle={handleReactionToggle}
            />
          ))}
        </div>

      </div>
    </div>
  );

  if (embedded) return <>{content}</>;

  return (
    <main style={{ padding: 0, position: "relative", minHeight: "100dvh" }}>

      {/* Ambient background */}
      {eventImageUrl ? (
        <div aria-hidden="true" style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none" }}>
          <img
            src={eventImageUrl}
            alt=""
            style={{
              position: "absolute", inset: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
              filter: "blur(80px) saturate(1.8) brightness(0.38)",
              transform: "scale(1.15)",
              pointerEvents: "none",
            }}
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: "fixed", inset: 0, zIndex: 0,
            background: categoryBg(eventCategory),
            opacity: 0.6,
            pointerEvents: "none",
          }}
        />
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Top nav bar */}
        <div
          style={{
            display: "flex", alignItems: "center",
            padding: "16px 16px 0",
            gap: 12,
          }}
        >
          <Link
            href={`/events/${eventId}`}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(0,0,0,0.32)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff", flexShrink: 0,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              textDecoration: "none",
            }}
            aria-label="Back to event"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, opacity: 0.45,
              textTransform: "uppercase", letterSpacing: "0.07em",
              overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
              color: "#fff",
            }}>
              {eventTitle}
            </div>
          </div>
        </div>

        {/* Tab strip */}
        <div
          style={{
            display: "flex", gap: 4, margin: "14px 16px 0",
            background: "rgba(255,255,255,0.06)",
            borderRadius: 12, padding: 3,
          }}
        >
          <Link
            href={`/events/${eventId}`}
            style={{
              flex: 1, textDecoration: "none",
              textAlign: "center", padding: "7px 0",
              borderRadius: 9, fontSize: 14, fontWeight: 600,
              color: "rgba(255,255,255,0.50)",
            }}
          >
            Info
          </Link>
          <div
            style={{
              flex: 1, textAlign: "center", padding: "7px 0",
              borderRadius: 9, fontSize: 14, fontWeight: 600,
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
            }}
          >
            Moments
          </div>
        </div>

        {content}
      </div>
    </main>
  );
}

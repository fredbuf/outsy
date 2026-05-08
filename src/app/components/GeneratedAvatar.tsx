/* eslint-disable @next/next/no-img-element */
// Pure rendering — no "use client" needed. Works in both server and client components.

import React from "react";

// ── Gradient palette ──────────────────────────────────────────────────────────
// 8 vibrant-but-controlled pairs shared by users + organizers.
// Shape (circle vs rounded-square) differentiates the two — not colour.
// Each pair goes dark-anchor → light-anchor at 135°.
const GRADIENT_PAIRS: [string, string][] = [
  ["#6d28d9", "#a855f7"],  // violet → lavender
  ["#0369a1", "#38bdf8"],  // ocean  → sky
  ["#047857", "#34d399"],  // emerald → mint
  ["#b45309", "#fbbf24"],  // amber  → gold
  ["#be123c", "#fb7185"],  // crimson → rose
  ["#9d174d", "#f472b6"],  // plum   → pink
  ["#3730a3", "#818cf8"],  // indigo → periwinkle
  ["#0f766e", "#2dd4bf"],  // teal   → turquoise
];

// ── Public helpers ────────────────────────────────────────────────────────────

/** Deterministic hash used to pick a gradient pair from a name. */
function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return h;
}

/**
 * Returns the CSS `background` value for a generated avatar.
 * Layered: soft radial spotlight (top-left) + base linear gradient.
 * Export this if any component needs just the background string.
 */
export function avatarGradient(name: string | null): string {
  const [from, to] = GRADIENT_PAIRS[hashName(name ?? "?") % GRADIENT_PAIRS.length];
  return [
    "radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.15) 0%, transparent 58%)",
    `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
  ].join(", ");
}

/** Standard 2-char initials from a display name or org name. */
export function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Component ─────────────────────────────────────────────────────────────────

export type GeneratedAvatarProps = {
  /** Name used to derive the gradient + initials. */
  name: string | null;
  /**
   * "circle" for user avatars, "square" for organizer logos.
   * Default: "circle".
   */
  shape?: "circle" | "square";
  /** Pixel size (width = height). Default: 40. */
  size?: number;
  /**
   * If provided and non-empty, renders the image instead of the generated avatar.
   * Pass null / undefined to always render the generated fallback.
   */
  imageUrl?: string | null;
  /** Alt text for the image. Defaults to name. */
  alt?: string;
  /** Extra styles merged onto the root element (both image and generated div). */
  style?: React.CSSProperties;
  /** Extra CSS class on the root element. */
  className?: string;
  /** Override the auto-calculated font size (px). Default ≈ 37% of size. */
  fontSize?: number;
  /**
   * Override border-radius (px or CSS string).
   * If omitted: "50%" for circles, ~23% of size for squares.
   */
  borderRadius?: number | string;
  /** Override the rendered initials. Useful for single-char org logos. */
  initials?: string;
};

/**
 * `GeneratedAvatar` — premium gradient avatar with deterministic colour.
 *
 * Renders `imageUrl` when provided; otherwise renders a gradient square/circle
 * with initials derived from `name`. Depth comes from a layered radial highlight
 * + inset box-shadow — no extra wrapper needed.
 *
 * Usage:
 * ```tsx
 * // User avatar
 * <GeneratedAvatar name={user.display_name} imageUrl={user.custom_avatar_url} size={40} />
 *
 * // Org logo
 * <GeneratedAvatar name={org.name} shape="square" imageUrl={org.custom_image_url} size={36} />
 * ```
 */
export function GeneratedAvatar({
  name,
  shape = "circle",
  size = 40,
  imageUrl,
  alt,
  style,
  className,
  fontSize,
  borderRadius,
  initials,
}: GeneratedAvatarProps) {
  const radius: string | number =
    borderRadius !== undefined
      ? borderRadius
      : shape === "circle"
      ? "50%"
      : Math.round(size * 0.23);

  const autoFontSize = fontSize ?? Math.round(size * 0.375);
  const label = initials ?? getInitials(name);

  const sharedStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    ...style,
  };

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={alt ?? name ?? ""}
        className={className}
        style={{ ...sharedStyle, objectFit: "cover", display: "block" }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        ...sharedStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: avatarGradient(name),
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.22), 0 2px 10px rgba(0,0,0,0.30)",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontSize: autoFontSize,
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          fontFamily: "inherit",
          pointerEvents: "none",
        }}
      >
        {label}
      </span>
    </div>
  );
}

"use client";

import { useState } from "react";

export function CopyInviteLink({
  title,
  visibility,
}: {
  title?: string;
  visibility: "public" | "private";
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleShare() {
    const url = window.location.href;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: title ?? "Check out this event", url });
        return;
      } catch {
        // user cancelled or unsupported — fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    const msg = visibility === "private" ? "Invite link copied!" : "Link copied!";
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2000);
  }

  const label = visibility === "private" ? "Invite friends" : "Share event";

  return (
    <button
      type="button"
      onClick={handleShare}
      style={{
        alignSelf: "start",
        padding: "10px 20px",
        borderRadius: 12,
        border: "1px solid var(--border-strong)",
        background: "transparent",
        fontWeight: 600,
        fontSize: 14,
        cursor: "pointer",
        transition: "opacity 0.15s",
      }}
    >
      {feedback ?? label}
    </button>
  );
}

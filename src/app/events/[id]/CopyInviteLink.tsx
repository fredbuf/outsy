"use client";

import { useState } from "react";

export function CopyInviteLink() {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that block clipboard without user gesture context
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
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
      {copied ? "Link copied!" : "Copy invite link"}
    </button>
  );
}

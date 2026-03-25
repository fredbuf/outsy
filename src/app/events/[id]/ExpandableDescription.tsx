"use client";

import { useState } from "react";

const THRESHOLD = 280;

export function ExpandableDescription({ text }: { text: string }) {
  const isLong = text.length > THRESHOLD;
  const [expanded, setExpanded] = useState(false);

  if (!isLong) {
    return (
      <p style={{ fontSize: 15, lineHeight: 1.75, opacity: 0.85, whiteSpace: "pre-wrap", margin: 0 }}>
        {text}
      </p>
    );
  }

  return (
    <div>
      <p
        style={{
          fontSize: 15,
          lineHeight: 1.75,
          opacity: 0.85,
          whiteSpace: "pre-wrap",
          margin: 0,
          ...(expanded
            ? {}
            : {
                overflow: "hidden",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
              }),
        }}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          marginTop: 6,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 600,
          opacity: 0.55,
          textDecoration: "underline",
          color: "inherit",
        }}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

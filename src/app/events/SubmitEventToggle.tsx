"use client";

import { useState } from "react";
import { SubmitEventForm } from "./SubmitEventForm";

export function SubmitEventToggle() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {open ? "Hide submission form" : "Submit an event"}
        </button>
      </div>

      {open && <SubmitEventForm />}
    </div>
  );
}

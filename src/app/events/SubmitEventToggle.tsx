"use client";

import { useEffect, useState } from "react";
import { SubmitEventForm } from "./SubmitEventForm";

export function SubmitEventToggle() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.location.hash === "#submit") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function requestSignIn() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  return (
    <>
      <div id="submit">
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "10px 18px",
            borderRadius: 10,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6.5 1v11M1 6.5h11" />
          </svg>
          New event
        </button>
      </div>

      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 300,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            overflowY: "auto",
            padding: "32px 16px 48px",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 560,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px 0",
              }}
            >
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>New event</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  opacity: 0.35,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <SubmitEventForm
              onSignInRequest={requestSignIn}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}

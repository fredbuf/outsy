"use client";

import { useState } from "react";

export function PaymentReveal({
  price,
  currency,
  paymentMethod,
  paymentContact,
}: {
  price: number;
  currency: string;
  paymentMethod: string | null;
  paymentContact: string | null;
}) {
  const [open, setOpen] = useState(false);

  const priceStr = `${currency === "USD" ? "US$" : "CA$"}${price.toFixed(2)}`;
  const methodLabel = paymentMethod === "interac" ? "Interac" : paymentMethod ?? null;
  const rowLabel = methodLabel ? `${priceStr} · ${methodLabel}` : priceStr;

  return (
    <>
      {/* Tappable payment row — icon + underlined label */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "none", border: "none",
          padding: 0, cursor: "pointer",
          color: "inherit", fontFamily: "inherit",
          fontSize: 14, textAlign: "left",
        }}
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.5, flexShrink: 0 }}
        >
          <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z" />
          <path d="M13 5v2M13 17v2M13 11v2" />
        </svg>
        <span style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{rowLabel}</span>
      </button>

      {/* Payment details bottom sheet */}
      {open && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "var(--background, #111)",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
              color: "var(--foreground, #eae8e4)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "none", cursor: "pointer",
                  color: "inherit", flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>
                Payment
              </span>
              {/* Spacer to balance the close button */}
              <div style={{ width: 34, flexShrink: 0 }} />
            </div>

            {/* Body */}
            <div style={{ padding: "24px 24px 8px" }}>
              <div style={{ height: 1, background: "rgba(255,255,255,0.10)", marginBottom: 24 }} />

              {/* Price line */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <span style={{ fontSize: 14, opacity: 0.55 }}>Amount</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{priceStr}</span>
              </div>

              {/* Payment method */}
              {methodLabel && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                  <span style={{ fontSize: 14, opacity: 0.55 }}>Method</span>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{methodLabel}</span>
                </div>
              )}

              {/* Payment contact */}
              {paymentContact && (
                <div style={{ marginTop: 20, padding: "14px 16px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <div style={{ fontSize: 11, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
                    Send payment to
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, wordBreak: "break-all" }}>
                    {paymentContact}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

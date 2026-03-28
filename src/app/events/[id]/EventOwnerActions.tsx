"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";

export function EventOwnerActions({
  eventId,
  creatorId,
  source,
  compact = false,
}: {
  eventId: string;
  creatorId: string | null;
  source: string | null;
  compact?: boolean;
}) {
  const { user, session } = useAuth();
  const router = useRouter();
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isOwner = Boolean(user && user.id === creatorId && source === "manual");
  if (!isOwner) return null;

  async function handleDelete() {
    if (deleteState !== "confirming" || !session?.access_token) return;
    setDeleteState("deleting");
    setDeleteError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to delete.");
      router.push("/profile");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete.");
      setDeleteState("idle");
    }
  }

  // Shared delete confirmation overlay
  const deleteOverlay = deleteState !== "idle" && (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 400,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          background: "var(--background)", borderRadius: 16,
          border: "1px solid var(--border)", padding: "20px 22px",
          width: "100%", maxWidth: 320, display: "grid", gap: 14,
        }}
      >
        <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Delete this event?</p>
        <p style={{ fontSize: 13, opacity: 0.6, margin: 0 }}>This cannot be undone.</p>
        {deleteError && <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{deleteError}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteState === "deleting"}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
              background: "#dc2626", color: "#fff", fontWeight: 700,
              fontSize: 14, cursor: deleteState === "deleting" ? "wait" : "pointer",
              opacity: deleteState === "deleting" ? 0.6 : 1,
            }}
          >
            {deleteState === "deleting" ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => { setDeleteState("idle"); setDeleteError(null); }}
            disabled={deleteState === "deleting"}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 10,
              border: "1px solid var(--border)", background: "transparent",
              fontSize: 14, cursor: "pointer", color: "inherit",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  // ── Compact mode: 3-dot button in hero ──────────────────────────────────
  if (compact) {
    return (
      <>
        <div style={{ position: "relative" }}>
          <button
            type="button"
            aria-label="Event options"
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(0,0,0,0.38)",
              border: "1px solid rgba(255,255,255,0.2)",
              cursor: "pointer", color: "#fff",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 199 }} onClick={() => setMenuOpen(false)} />
              <div
                style={{
                  position: "absolute", top: 42, right: 0, zIndex: 200,
                  background: "var(--background)", border: "1px solid var(--border)",
                  borderRadius: 12, overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18)", minWidth: 160,
                }}
              >
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); router.push(`/events/new?edit=${eventId}`); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 14, fontWeight: 500, cursor: "pointer", color: "inherit",
                  }}
                >
                  Edit event
                </button>
                <div style={{ height: 1, background: "var(--border)" }} />
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setDeleteState("confirming"); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "12px 16px", background: "none", border: "none",
                    fontSize: 14, fontWeight: 500, cursor: "pointer", color: "#dc2626",
                  }}
                >
                  Delete event
                </button>
              </div>
            </>
          )}
        </div>

        {deleteOverlay}
      </>
    );
  }

  // ── Default mode: inline Edit / Delete buttons ───────────────────────────
  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={() => router.push(`/events/new?edit=${eventId}`)}
          style={{
            padding: "9px 18px", borderRadius: 10,
            border: "1px solid var(--border-strong)", background: "transparent",
            fontWeight: 600, fontSize: 14, cursor: "pointer", color: "inherit",
          }}
        >
          Edit event
        </button>

        {deleteState === "idle" && (
          <button
            type="button"
            onClick={() => setDeleteState("confirming")}
            style={{
              padding: "9px 18px", borderRadius: 10,
              border: "1px solid var(--border-strong)", background: "transparent",
              fontWeight: 600, fontSize: 14, cursor: "pointer", color: "#dc2626",
            }}
          >
            Delete
          </button>
        )}
      </div>

      {deleteOverlay}
    </>
  );
}

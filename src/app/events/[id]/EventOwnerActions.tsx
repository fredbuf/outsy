"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../../components/AuthProvider";
import { SubmitEventForm } from "../SubmitEventForm";
import type { FormState } from "../SubmitEventForm";

export function EventOwnerActions({
  eventId,
  creatorId,
  source,
  eventData,
}: {
  eventId: string;
  creatorId: string | null;
  source: string | null;
  eventData: Partial<FormState> & { imageUrl: string | null };
}) {
  const { user, session } = useAuth();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Lock body scroll when edit modal is open
  useEffect(() => {
    document.body.style.overflow = editOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [editOpen]);

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

  const { imageUrl: initialImageUrl, ...initialValues } = eventData;

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
          onClick={() => setEditOpen(true)}
          style={{
            padding: "9px 18px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
            background: "transparent",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
            color: "inherit",
          }}
        >
          Edit event
        </button>

        {deleteState === "idle" && (
          <button
            type="button"
            onClick={() => setDeleteState("confirming")}
            style={{
              padding: "9px 18px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              color: "#dc2626",
            }}
          >
            Delete
          </button>
        )}

        {deleteState === "confirming" && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, opacity: 0.7 }}>Delete this event?</span>
            <button
              type="button"
              onClick={handleDelete}
              style={{
                padding: "7px 14px",
                borderRadius: 8,
                border: "none",
                background: "#dc2626",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setDeleteState("idle")}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "transparent",
                fontSize: 13,
                cursor: "pointer",
                color: "inherit",
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {deleteState === "deleting" && (
          <span style={{ fontSize: 13, opacity: 0.55 }}>Deleting…</span>
        )}
      </div>

      {deleteError && (
        <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{deleteError}</p>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setEditOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 300,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "24px 16px 48px",
            overflowY: "auto",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 480,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Edit event</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  lineHeight: 1,
                  opacity: 0.35,
                }}
              >
                ×
              </button>
            </div>
            <SubmitEventForm
              editEventId={eventId}
              initialValues={initialValues}
              initialImageUrl={initialImageUrl}
              onClose={() => {
                setEditOpen(false);
                router.refresh();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

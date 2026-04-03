"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { ActionBar } from "./ActionBar";
import { AttendeeList } from "./AttendeeList";
import { InviteFriendsButton } from "./InviteFriendsButton";
import { ShareButton } from "./ShareButton";

type Counts = { going: number; maybe: number; cant_go: number };
type Attendee = { display_name: string | null; avatar_url: string | null };

export function PrivateActionArea({
  eventId,
  eventTitle,
  creatorId,
  cohostIds,
  initialCounts,
  initialAttendees,
}: {
  eventId: string;
  eventTitle: string;
  creatorId: string | null;
  cohostIds: string[];
  initialCounts: Counts;
  initialAttendees: Attendee[];
}) {
  const { user } = useAuth();
  const isHost =
    Boolean(user) &&
    (user!.id === creatorId || cohostIds.includes(user!.id));

  return isHost ? (
    <HostView
      eventId={eventId}
      eventTitle={eventTitle}
      creatorId={creatorId}
      initialCounts={initialCounts}
      initialAttendees={initialAttendees}
    />
  ) : (
    <GuestView
      eventId={eventId}
      eventTitle={eventTitle}
      initialCounts={initialCounts}
      initialAttendees={initialAttendees}
    />
  );
}

// ── Host view ────────────────────────────────────────────────────────────────

function HostView({
  eventId,
  eventTitle,
  creatorId,
  initialCounts,
  initialAttendees,
}: {
  eventId: string;
  eventTitle: string;
  creatorId: string | null;
  initialCounts: Counts;
  initialAttendees: Attendee[];
}) {
  const { user, session } = useAuth();
  const router = useRouter();
  const [deleteState, setDeleteState] = useState<"idle" | "confirming" | "deleting">("idle");
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const isCreator = user?.id === creatorId;

  return (
    <>
      {/* Host action card */}
      <div
        style={{
          marginTop: 28,
          borderRadius: 16,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          padding: "14px 16px",
          display: "grid",
          gap: 10,
        }}
      >
        {/* Primary actions: Invite + Share */}
        <div style={{ display: "flex", gap: 8 }}>
          <InviteFriendsButton eventId={eventId} />
          <ShareButton title={eventTitle} eventId={eventId} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />

        {/* Secondary actions: Edit + Delete (creator only) */}
        {isCreator && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => router.push(`/events/${eventId}/edit`)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "inherit",
              }}
            >
              Edit event
            </button>
            <button
              type="button"
              onClick={() => setDeleteState("confirming")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10,
                border: "1px solid rgba(239,68,68,0.30)",
                background: "transparent", cursor: "pointer",
                fontSize: 13, fontWeight: 600, color: "#ef4444",
              }}
            >
              Delete event
            </button>
          </div>
        )}
      </div>

      {/* Guest count row — same layout as guest view but no invite/share (already above) */}
      <div
        style={{
          display: "flex", alignItems: "center",
          gap: 12, paddingTop: 18, paddingBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {initialCounts.going > 0 || initialCounts.maybe > 0 ? (
          <AttendeeList
            eventId={eventId}
            initialAttendees={initialAttendees}
            goingCount={initialCounts.going}
            maybeCount={initialCounts.maybe}
            avatarSize={36}
          />
        ) : (
          <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet.</span>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {deleteState !== "idle" && (
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
      )}
    </>
  );
}

// ── Guest view ───────────────────────────────────────────────────────────────

function GuestView({
  eventId,
  eventTitle,
  initialCounts,
  initialAttendees,
}: {
  eventId: string;
  eventTitle: string;
  initialCounts: Counts;
  initialAttendees: Attendee[];
}) {
  return (
    <>
      {/* RSVP bar */}
      <div style={{ paddingTop: 32, paddingBottom: 4 }}>
        <ActionBar
          eventId={eventId}
          initialCounts={initialCounts}
          sourceUrl={null}
          visibility="private"
        />
      </div>

      {/* Guest preview */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, paddingTop: 18, paddingBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {initialCounts.going > 0 || initialCounts.maybe > 0 ? (
          <AttendeeList
            eventId={eventId}
            initialAttendees={initialAttendees}
            goingCount={initialCounts.going}
            maybeCount={initialCounts.maybe}
            avatarSize={36}
          />
        ) : (
          <span style={{ fontSize: 14, opacity: 0.45 }}>No guests yet — be the first!</span>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <InviteFriendsButton eventId={eventId} />
          <ShareButton title={eventTitle} eventId={eventId} />
        </div>
      </div>
    </>
  );
}

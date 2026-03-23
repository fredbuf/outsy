/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Attendee = { display_name: string | null; avatar_url: string | null };
type FullAttendee = Attendee & { response: "going" | "maybe" };

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function AvatarCircle({
  a,
  size,
  stackBorder,
}: {
  a: Attendee;
  size: number;
  stackBorder?: boolean;
}) {
  const border = stackBorder ? "2px solid var(--background)" : "none";
  return a.avatar_url ? (
    <img
      src={a.avatar_url}
      alt={a.display_name ?? ""}
      title={a.display_name ?? undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        objectFit: "cover",
        border,
        display: "block",
        flexShrink: 0,
      }}
    />
  ) : (
    <div
      title={a.display_name ?? undefined}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: getAvatarColor(a.display_name),
        border,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 700,
        color: "#fff",
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {getInitials(a.display_name)}
    </div>
  );
}

function AttendeeRow({ a }: { a: Attendee }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <AvatarCircle a={a} size={34} />
      <span style={{ fontSize: 14 }}>{a.display_name ?? "Anonymous"}</span>
    </div>
  );
}

export function AttendeeList({
  eventId,
  initialAttendees,
  goingCount,
  maybeCount,
}: {
  eventId: string;
  initialAttendees: Attendee[];
  goingCount: number;
  maybeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [allAttendees, setAllAttendees] = useState<FullAttendee[] | null>(null);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function handleOpen() {
    setOpen(true);
    if (allAttendees !== null) return;
    setFetching(true);
    const { data } = await supabaseBrowser()
      .from("rsvps")
      .select("response,profiles(display_name,avatar_url)")
      .eq("event_id", eventId)
      .in("response", ["going", "maybe"])
      .order("updated_at", { ascending: false })
      .limit(100);

    const attendees: FullAttendee[] = [];
    for (const row of (data ?? []) as {
      response: string;
      profiles: Attendee | Attendee[] | null;
    }[]) {
      const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      if (p) attendees.push({ ...p, response: row.response as "going" | "maybe" });
    }
    setAllAttendees(attendees);
    setFetching(false);
  }

  const going = (allAttendees ?? []).filter((a) => a.response === "going");
  const interested = (allAttendees ?? []).filter((a) => a.response === "maybe");
  const totalCount = goingCount + maybeCount;

  const countLabel =
    goingCount > 0
      ? `${goingCount} going${maybeCount > 0 ? ` · ${maybeCount} interested` : ""}`
      : `${maybeCount} interested`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {/* Avatar stack */}
          <div style={{ display: "flex" }}>
            {initialAttendees.map((a, i) => (
              <div
                key={i}
                style={{
                  marginLeft: i === 0 ? 0 : -8,
                  zIndex: initialAttendees.length - i,
                  position: "relative",
                }}
              >
                <AvatarCircle a={a} size={30} stackBorder />
              </div>
            ))}
            {goingCount > initialAttendees.length && (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: "var(--surface-subtle)",
                  border: "2px solid var(--background)",
                  marginLeft: -8,
                  zIndex: 0,
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  opacity: 0.75,
                }}
              >
                +{goingCount - initialAttendees.length}
              </div>
            )}
          </div>
          <span style={{ fontSize: 13, opacity: 0.7 }}>{countLabel}</span>
        </button>
      </div>

      {/* Attendee modal */}
      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 400,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 18px",
                borderBottom: "1px solid var(--border)",
                flexShrink: 0,
              }}
            >
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>
                Attending · {totalCount}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
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

            {/* Modal body */}
            <div
              style={{
                overflowY: "auto",
                padding: "16px 18px",
                display: "grid",
                gap: 20,
              }}
            >
              {fetching ? (
                <p style={{ opacity: 0.5, fontSize: 14 }}>Loading…</p>
              ) : (
                <>
                  {going.length > 0 && (
                    <section style={{ display: "grid", gap: 10 }}>
                      <h3
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: 0.45,
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                        }}
                      >
                        Going · {going.length}
                      </h3>
                      {going.map((a, i) => (
                        <AttendeeRow key={i} a={a} />
                      ))}
                    </section>
                  )}
                  {interested.length > 0 && (
                    <section style={{ display: "grid", gap: 10 }}>
                      <h3
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          opacity: 0.45,
                          textTransform: "uppercase",
                          letterSpacing: "0.07em",
                        }}
                      >
                        Interested · {interested.length}
                      </h3>
                      {interested.map((a, i) => (
                        <AttendeeRow key={i} a={a} />
                      ))}
                    </section>
                  )}
                  {going.length === 0 && interested.length === 0 && (
                    <p style={{ opacity: 0.5, fontSize: 14 }}>No responses yet.</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Attendee = { display_name: string | null; avatar_url: string | null; userId?: string | null };
type FullAttendee = Attendee & { response: "going" | "maybe" };
type RpcRow = { user_id: string; response: string; display_name: string | null; avatar_url: string | null; username: string | null };

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
  const inner = (
    <>
      <AvatarCircle a={a} size={34} />
      <span style={{ fontSize: 14 }}>{a.display_name ?? "Anonymous"}</span>
    </>
  );
  if (a.userId) {
    return (
      <Link href={`/profile/${a.userId}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", cursor: "pointer" }}>
        {inner}
      </Link>
    );
  }
  return <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{inner}</div>;
}

export function AttendeeList({
  eventId,
  initialAttendees,
  goingCount,
  maybeCount,
  visibility,
  token,
  avatarSize = 30,
}: {
  eventId: string;
  initialAttendees: Attendee[];
  goingCount: number;
  maybeCount: number;
  visibility: "public" | "unlisted" | "private";
  token: string | null;
  avatarSize?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [allAttendees, setAllAttendees] = useState<FullAttendee[] | null>(null);
  const [fetching, setFetching] = useState(false);

  // Re-open modal when returning via back button from a profile page
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("guests") === "open") {
      handleOpen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function closeModal() {
    setOpen(false);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("guests");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  async function handleOpen() {
    setOpen(true);
    // Stamp URL so back-navigation from a profile restores this modal
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("guests") !== "open") {
      sp.set("guests", "open");
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    }
    // Unauthenticated — modal will show a sign-in prompt; no fetch needed
    if (!token) return;
    if (allAttendees !== null) return;
    setFetching(true);

    const rpcName = visibility === "private" ? "get_event_rsvp_list" : "get_friend_rsvps";
    const { data } = await supabaseBrowser().rpc(rpcName, { p_event_id: eventId });

    const attendees: FullAttendee[] = ((data as RpcRow[]) ?? []).map((row) => ({
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      userId: row.user_id,
      response: row.response as "going" | "maybe",
    }));
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

  const MAX_VISIBLE = 3;
  const visibleAvatars = initialAttendees.slice(0, MAX_VISIBLE);
  const overflowCount = totalCount - MAX_VISIBLE;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleOpen}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {/* Avatar stack — capped at MAX_VISIBLE */}
          <div style={{ display: "flex" }}>
            {visibleAvatars.map((a, i) => (
              <div
                key={i}
                style={{
                  marginLeft: i === 0 ? 0 : -(avatarSize * 0.27),
                  zIndex: visibleAvatars.length - i,
                  position: "relative",
                }}
              >
                <AvatarCircle a={a} size={avatarSize} stackBorder />
              </div>
            ))}
          </div>
          {/* Overflow indicator */}
          {overflowCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.70, flexShrink: 0 }}>
              +{overflowCount}
            </span>
          )}
          <span style={{ fontSize: 13, opacity: 0.7, flexShrink: 0 }}>{countLabel}</span>
        </button>
      </div>

      {/* Attendee modal */}
      {open && createPortal(
        <div
          onClick={(e) => e.target === e.currentTarget && closeModal()}
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
              background: "#111110",
              color: "#eae8e4",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 400,
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
              "--border": "rgba(255,255,255,0.10)",
              "--border-strong": "rgba(255,255,255,0.18)",
              "--accent": "#a78bfa",
            } as React.CSSProperties}
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
                onClick={closeModal}
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
              ) : !token ? (
                <p style={{ opacity: 0.5, fontSize: 14 }}>
                  {visibility === "private"
                    ? "Sign in to see who's going to this event."
                    : "Sign in to see which friends are going."}
                </p>
              ) : visibility === "private" ? (
                // Private events: show all attendees; collapse empty sections
                <>
                  {going.length > 0 && (
                    <section style={{ display: "grid", gap: 10 }}>
                      <h3 style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Going · {going.length}
                      </h3>
                      {going.map((a, i) => <AttendeeRow key={i} a={a} />)}
                    </section>
                  )}
                  {interested.length > 0 && (
                    <section style={{ display: "grid", gap: 10 }}>
                      <h3 style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                        Interested · {interested.length}
                      </h3>
                      {interested.map((a, i) => <AttendeeRow key={i} a={a} />)}
                    </section>
                  )}
                  {going.length === 0 && interested.length === 0 && (
                    <p style={{ opacity: 0.5, fontSize: 14 }}>No guests yet.</p>
                  )}
                </>
              ) : (
                // Public/unlisted: show friend responses; always render both sections with empty states
                <>
                  <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Going · {going.length}
                    </h3>
                    {going.length > 0
                      ? going.map((a, i) => <AttendeeRow key={i} a={a} />)
                      : <p style={{ opacity: 0.5, fontSize: 14, margin: 0 }}>No friends have responded Going.</p>
                    }
                  </section>
                  <section style={{ display: "grid", gap: 10 }}>
                    <h3 style={{ fontSize: 11, fontWeight: 600, opacity: 0.45, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      Interested · {interested.length}
                    </h3>
                    {interested.length > 0
                      ? interested.map((a, i) => <AttendeeRow key={i} a={a} />)
                      : <p style={{ opacity: 0.5, fontSize: 14, margin: 0 }}>No friends have responded Interested.</p>
                    }
                  </section>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

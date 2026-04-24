/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Attendee = { display_name: string | null; avatar_url: string | null; userId?: string | null };
type FullAttendee = Attendee & { response: "going" | "maybe"; username?: string | null };
type RpcRow = {
  user_id: string;
  response: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
};

const AVATAR_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#14b8a6", "#6366f1", "#0284c7",
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

function AttendeeRow({ a }: { a: FullAttendee }) {
  const inner = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 20px",
      }}
    >
      <AvatarCircle a={a} size={42} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#F5F7FA",
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {a.display_name ?? "Anonymous"}
        </span>
        {a.username && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", lineHeight: 1.2 }}>
            @{a.username}
          </span>
        )}
      </div>
    </div>
  );

  if (a.userId) {
    return (
      <Link
        href={`/profile/${a.userId}`}
        style={{ display: "block", textDecoration: "none" }}
      >
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px" }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.08)",
          flexShrink: 0,
          animationDelay: `${delay}ms`,
        }}
        className="skeleton"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <div
          style={{
            height: 13,
            borderRadius: 6,
            background: "rgba(255,255,255,0.08)",
            width: "52%",
            animationDelay: `${delay}ms`,
          }}
          className="skeleton"
        />
        <div
          style={{
            height: 10,
            borderRadius: 6,
            background: "rgba(255,255,255,0.06)",
            width: "32%",
            animationDelay: `${delay + 100}ms`,
          }}
          className="skeleton"
        />
      </div>
    </div>
  );
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
  const [closing, setClosing] = useState(false);
  const [allAttendees, setAllAttendees] = useState<FullAttendee[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [activeTab, setActiveTab] = useState<"going" | "maybe">("going");

  // Re-open sheet when returning via back button from a profile page
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

  function closeSheet() {
    setClosing(true);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("guests");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 250);
  }

  async function handleOpen() {
    setOpen(true);
    setClosing(false);
    setActiveTab(goingCount > 0 ? "going" : "maybe");

    const sp = new URLSearchParams(window.location.search);
    if (sp.get("guests") !== "open") {
      sp.set("guests", "open");
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    }

    if (!token) return;
    if (allAttendees !== null) return;
    setFetching(true);

    const rpcName = visibility === "private" ? "get_event_rsvp_list" : "get_friend_rsvps";
    const { data } = await supabaseBrowser().rpc(rpcName, { p_event_id: eventId });

    const attendees: FullAttendee[] = ((data as RpcRow[]) ?? []).map((row) => ({
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      userId: row.user_id,
      username: row.username,
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

  const maybeLabel = visibility === "private" ? "Maybe" : "Interested";
  const activeList = activeTab === "going" ? going : interested;
  const tabGoingCount = allAttendees ? going.length : goingCount;
  const tabMaybeCount = allAttendees ? interested.length : maybeCount;

  return (
    <>
      {/* ── Trigger: avatar stack + count label ── */}
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
          {overflowCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.70, flexShrink: 0 }}>
              +{overflowCount}
            </span>
          )}
          <span style={{ fontSize: 13, opacity: 0.7, flexShrink: 0 }}>{countLabel}</span>
        </button>
      </div>

      {/* ── Sheet portal ── */}
      {open && createPortal(
        <div
          onClick={(e) => e.target === e.currentTarget && closeSheet()}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 300,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            className={closing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              height: "88dvh",
              display: "flex",
              flexDirection: "column",
              borderRadius: "20px 20px 0 0",
              overflow: "hidden",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderBottom: "none",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
              <div
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  background: "rgba(255,255,255,0.40)",
                }}
              />
            </div>

            {/* Header: [empty] | title + count | [X] */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 40px",
                alignItems: "center",
                padding: "12px 16px 14px",
                flexShrink: 0,
              }}
            >
              <div />
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F7FA" }}>
                  Guests
                </span>
                {totalCount > 0 && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.40)", marginLeft: 6 }}>
                    {totalCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  justifySelf: "end",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 1l10 10M11 1L1 11"
                    stroke="#F5F7FA"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Tab switcher: Going | Interested/Maybe */}
            <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", flexShrink: 0 }}>
              {(["going", "maybe"] as const).map((tab) => {
                const isActive = activeTab === tab;
                const label = tab === "going" ? "Going" : maybeLabel;
                const count = tab === "going" ? tabGoingCount : tabMaybeCount;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: 20,
                      border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                      background: isActive
                        ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                        : "rgba(255,255,255,0.07)",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 13,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                    }}
                  >
                    {label} · {count}
                  </button>
                );
              })}
            </div>

            {/* Scrollable list */}
            <div
              style={{
                overflowY: "auto",
                flex: 1,
                paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              }}
            >
              {fetching ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <SkeletonRow key={i} delay={i * 60} />
                ))
              ) : !token ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    minHeight: 120,
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.40)",
                      textAlign: "center",
                      padding: "0 32px",
                    }}
                  >
                    {visibility === "private"
                      ? "Sign in to see who\u2019s going to this event."
                      : "Sign in to see which friends are going."}
                  </p>
                </div>
              ) : activeList.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    minHeight: 120,
                  }}
                >
                  <p
                    style={{
                      fontSize: 14,
                      color: "rgba(255,255,255,0.40)",
                      textAlign: "center",
                      padding: "0 32px",
                    }}
                  >
                    {activeTab === "going"
                      ? visibility === "private"
                        ? "No guests going yet."
                        : "No friends going yet."
                      : visibility === "private"
                        ? "No guests marked maybe."
                        : "No friends marked interested."}
                  </p>
                </div>
              ) : (
                activeList.map((a, i) => <AttendeeRow key={i} a={a} />)
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

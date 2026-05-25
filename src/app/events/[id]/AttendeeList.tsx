/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { GeneratedAvatar } from "@/app/components/GeneratedAvatar";

// ── Types ─────────────────────────────────────────────────────────────────────

type Attendee = { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null; userId?: string | null };
type FullAttendee = Attendee & {
  response: "going" | "maybe" | "cant_go";
  username?: string | null;
};
type RpcRow = {
  user_id: string;
  response: string;
  display_name: string | null;
  avatar_url: string | null;
  custom_avatar_url: string | null;
  username: string | null;
};
type OrgProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  custom_avatar_url?: string | null;
  username?: string | null;
};

type Tab = "going" | "maybe" | "cant_go";

// ── AvatarCircle ──────────────────────────────────────────────────────────────

function AvatarCircle({
  a,
  size,
  stackBorder,
}: {
  a: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null };
  size: number;
  stackBorder?: boolean;
}) {
  const border = stackBorder ? "2px solid var(--background)" : undefined;
  return (
    <GeneratedAvatar
      name={a.display_name}
      imageUrl={a.custom_avatar_url ?? a.avatar_url ?? null}
      size={size}
      style={{ border, flexShrink: 0 }}
    />
  );
}

// ── AttendeeRow ───────────────────────────────────────────────────────────────

function AttendeeRow({ a }: { a: FullAttendee }) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px" }}>
      <AvatarCircle a={a} size={40} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{
          fontSize: 15, fontWeight: 600, color: "#F5F7FA", lineHeight: 1.25,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {a.display_name ?? "Anonymous"}
        </span>
        {a.username && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.2 }}>
            @{a.username}
          </span>
        )}
      </div>
    </div>
  );

  if (a.userId) {
    return (
      <Link href={`/profile/${a.userId}`} style={{ display: "block", textDecoration: "none" }}>
        {inner}
      </Link>
    );
  }
  return <div>{inner}</div>;
}

// ── OrganizerRow ──────────────────────────────────────────────────────────────

function OrganizerRow({ p, role, userId }: { p: OrgProfile; role: "Host" | "Organizer" | "Cohost"; userId: string }) {
  const inner = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px" }}>
      <AvatarCircle a={p} size={40} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{
          fontSize: 15, fontWeight: 600, color: "#F5F7FA", lineHeight: 1.25,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {p.display_name ?? "Anonymous"}
        </span>
        {p.username && (
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", lineHeight: 1.2 }}>
            @{p.username}
          </span>
        )}
      </div>
      {/* Role badge */}
      <span style={{
        fontSize: 11, fontWeight: 700, color: "#5EA8FF",
        background: "rgba(94,168,255,0.12)",
        border: "1px solid rgba(94,168,255,0.20)",
        borderRadius: 20, padding: "3px 9px",
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {role}
      </span>
    </div>
  );

  return (
    <Link href={`/profile/${userId}`} style={{ display: "block", textDecoration: "none" }}>
      {inner}
    </Link>
  );
}

// ── SkeletonRow ───────────────────────────────────────────────────────────────

function SkeletonRow({ delay }: { delay: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px" }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: "50%",
          background: "rgba(255,255,255,0.08)", flexShrink: 0,
          animationDelay: `${delay}ms`,
        }}
        className="skeleton"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        <div
          style={{ height: 12, borderRadius: 6, background: "rgba(255,255,255,0.08)", width: "50%", animationDelay: `${delay}ms` }}
          className="skeleton"
        />
        <div
          style={{ height: 10, borderRadius: 6, background: "rgba(255,255,255,0.06)", width: "30%", animationDelay: `${delay + 100}ms` }}
          className="skeleton"
        />
      </div>
    </div>
  );
}

// ── AttendeeList (main export) ────────────────────────────────────────────────

export function AttendeeList({
  eventId,
  initialAttendees,
  goingCount,
  maybeCount,
  cantGoCount = 0,
  visibility,
  token,
  avatarSize = 30,
  creatorId,
  creator,
  cohostProfiles = [],
}: {
  eventId: string;
  initialAttendees: Attendee[];
  goingCount: number;
  maybeCount: number;
  cantGoCount?: number;
  visibility: "public" | "unlisted" | "private";
  token: string | null;
  avatarSize?: number;
  creatorId?: string | null;
  creator?: { display_name: string | null; avatar_url: string | null; custom_avatar_url?: string | null; username: string | null } | null;
  cohostProfiles?: OrgProfile[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [allAttendees, setAllAttendees] = useState<FullAttendee[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("going");

  // Re-open modal when returning via back button from a profile page
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("guests") === "open") {
      handleOpen();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Allow EventBody's GuestsRow to open the modal via a custom event
  const handleOpenRef = useRef(handleOpen);
  useEffect(() => { handleOpenRef.current = handleOpen; });
  useEffect(() => {
    const handler = () => handleOpenRef.current();
    window.addEventListener("outsy:open-guest-list", handler);
    return () => window.removeEventListener("outsy:open-guest-list", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function closeModal() {
    setClosing(true);
    const sp = new URLSearchParams(window.location.search);
    sp.delete("guests");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  }

  async function handleOpen() {
    setOpen(true);
    setClosing(false);
    setActiveTab(goingCount > 0 ? "going" : maybeCount > 0 ? "maybe" : "cant_go");

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
      custom_avatar_url: row.custom_avatar_url,
      userId: row.user_id,
      username: row.username,
      response: row.response as "going" | "maybe" | "cant_go",
    }));
    setAllAttendees(attendees);
    setFetching(false);
  }

  // Org IDs to exclude from the guest lists
  const orgIds = new Set<string>([
    ...(creatorId ? [creatorId] : []),
    ...(cohostProfiles ?? []).map((c) => c.id),
  ]);

  const going = (allAttendees ?? []).filter((a) => a.response === "going" && !orgIds.has(a.userId ?? ""));
  const interested = (allAttendees ?? []).filter((a) => a.response === "maybe" && !orgIds.has(a.userId ?? ""));
  const cantGo = (allAttendees ?? []).filter((a) => a.response === "cant_go" && !orgIds.has(a.userId ?? ""));

  const totalCount = goingCount + maybeCount + cantGoCount;
  const tabGoingCount = allAttendees ? going.length : goingCount;
  const tabMaybeCount = allAttendees ? interested.length : maybeCount;
  const tabCantGoCount = allAttendees ? cantGo.length : cantGoCount;

  const countLabel =
    goingCount > 0
      ? `${goingCount} going${maybeCount > 0 ? ` · ${maybeCount} interested` : ""}`
      : `${maybeCount} interested`;

  const MAX_VISIBLE = 3;
  const visibleAvatars = initialAttendees.slice(0, MAX_VISIBLE);
  const overflowCount = totalCount - MAX_VISIBLE;

  const maybeLabel = visibility === "private" ? "Maybe" : "Interested";

  const activeList = activeTab === "going" ? going : activeTab === "maybe" ? interested : cantGo;

  // Tab definitions
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "going",   label: "Going",         count: tabGoingCount },
    { key: "maybe",   label: maybeLabel,       count: tabMaybeCount },
    { key: "cant_go", label: "Can\u2019t go",  count: tabCantGoCount },
  ];

  const hasOrganizer = Boolean(creatorId && creator);

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          onClick={handleOpen}
          style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <div style={{ display: "flex" }}>
            {visibleAvatars.map((a, i) => (
              <div
                key={i}
                style={{ marginLeft: i === 0 ? 0 : -(avatarSize * 0.27), zIndex: visibleAvatars.length - i, position: "relative" }}
              >
                <AvatarCircle a={a} size={avatarSize} />
              </div>
            ))}
          </div>
          {overflowCount > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.70, flexShrink: 0 }}>+{overflowCount}</span>
          )}
          <span style={{ fontSize: 13, opacity: 0.7, flexShrink: 0 }}>{countLabel}</span>
        </button>
      </div>

      {/* ── Modal portal ────────────────────────────────────────────────── */}
      {open && createPortal(
        <div
          onClick={(e) => e.target === e.currentTarget && closeModal()}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.60)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
          }}
        >
          <div
            className={closing ? "modal-zoom-exit" : "modal-zoom-enter"}
            style={{
              width: "100%",
              maxWidth: 420,
              height: "min(580px, 85dvh)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 24,
              overflow: "hidden",
              background: "rgba(13,18,28,0.96)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
          >
            {/* ── Header ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "40px 1fr 40px",
                alignItems: "center",
                padding: "18px 16px 14px",
                flexShrink: 0,
              }}
            >
              <div />
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#F5F7FA" }}>Guests</span>
                {totalCount > 0 && (
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", marginLeft: 6 }}>
                    {totalCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={closeModal}
                aria-label="Close"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", justifySelf: "end",
                  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <path d="M1 1l9 9M10 1L1 10" stroke="#F5F7FA" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* ── Segmented tabs: Going / Maybe-Interested / Can't go ── */}
            <div
              style={{
                display: "flex",
                gap: 6,
                padding: "0 16px 14px",
                flexShrink: 0,
              }}
            >
              {tabs.map(({ key, label, count }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    style={{
                      flex: 1,
                      padding: "8px 4px",
                      borderRadius: 20,
                      border: isActive ? "none" : "1px solid rgba(255,255,255,0.09)",
                      background: isActive
                        ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                        : "rgba(255,255,255,0.06)",
                      color: isActive ? "#fff" : "rgba(255,255,255,0.50)",
                      fontWeight: isActive ? 700 : 500,
                      fontSize: 12,
                      cursor: "pointer",
                      transition: "background 0.15s, color 0.15s",
                      lineHeight: 1.3,
                    }}
                  >
                    {label}
                    <br />
                    <span style={{ fontSize: 13, fontWeight: isActive ? 800 : 600 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Scrollable body ── */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                paddingBottom: "env(safe-area-inset-bottom, 12px)",
              }}
            >
              {/* Organizer section — Going tab only */}
              {hasOrganizer && activeTab === "going" && (
                <>
                  <p style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.30)", textTransform: "uppercase",
                    padding: "0 20px 6px", margin: 0,
                  }}>
                    {visibility === "private" ? "Host" : "Organizer"}
                  </p>
                  <OrganizerRow
                    p={{ id: creatorId!, ...(creator as { display_name: string | null; avatar_url: string | null; username: string | null }) }}
                    role={visibility === "private" ? "Host" : "Organizer"}
                    userId={creatorId!}
                  />
                  {(cohostProfiles ?? []).map((c) => (
                    <OrganizerRow key={c.id} p={c} role="Cohost" userId={c.id} />
                  ))}
                  {/* Divider before guest list */}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "10px 20px 10px" }} />
                </>
              )}

              {/* Guest list */}
              {fetching ? (
                [0, 1, 2, 3].map((i) => <SkeletonRow key={i} delay={i * 60} />)
              ) : !token ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", textAlign: "center" }}>
                    {visibility === "private"
                      ? "Sign in to see who\u2019s going to this event."
                      : "Sign in to see which friends are going."}
                  </p>
                </div>
              ) : activeList.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 32px" }}>
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,0.38)", textAlign: "center" }}>
                    No one yet.
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

"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { GoingIcon, CantGoIcon, MaybeIcon } from "./CustomIcons";

type RsvpResponse = "going" | "maybe" | "cant_go";
type Counts = { going: number; maybe: number; cant_go: number };

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}


export function ActionBar({
  eventId,
  initialCounts,
  sourceUrl,
  visibility,
}: {
  eventId: string;
  initialCounts: Counts;
  sourceUrl: string | null;
  visibility: "public" | "private";
}) {
  const { user, loading: authLoading, session } = useAuth();
  const [counts, setCounts] = useState<Counts>(initialCounts);
  const [myResponse, setMyResponse] = useState<RsvpResponse | null>(null);
  const [loadingRsvp, setLoadingRsvp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session?.access_token) return;
    setLoadingRsvp(true);
    fetch(`/api/events/${eventId}/rsvp`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.ok) {
          setMyResponse((json.myResponse as RsvpResponse) ?? null);
          setCounts(json.counts);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRsvp(false));
  }, [eventId, session?.access_token]);

  async function handleRsvp(r: RsvpResponse) {
    if (!session?.access_token || submitting) return;
    const isToggleOff = myResponse === r;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: isToggleOff ? "DELETE" : "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        ...(isToggleOff ? {} : { body: JSON.stringify({ response: r }) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) return;
      setMyResponse(isToggleOff ? null : r);
      setCounts(json.counts);
    } finally {
      setSubmitting(false);
    }
  }

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  const busy = submitting || loadingRsvp;
  const isPublic = visibility === "public";
  const hasTickets = isPublic && !!sourceUrl;

  // For private events: each response has a distinct icon/text color,
  // but the selected pill background is always the same blue-navy tint
  // matching the Figma design.
  const PRIVATE_FG: Record<RsvpResponse, string> = {
    going:   "#10b981",
    maybe:   "#f59e0b",
    cant_go: "#ef4444",
  };

  function segmentStyle(response: RsvpResponse) {
    const active = myResponse === response;
    const privateActive = !isPublic && active;
    return {
      flex: 1,
      alignSelf: "stretch" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 5,
      padding: isPublic ? "14px 8px" : "12px 8px",
      borderRadius: isPublic ? 11 : 16,
      border: "none",
      background: privateActive
        ? "rgba(59,130,246,0.25)"
        : active ? "var(--background)" : "transparent",
      fontWeight: active ? 600 : 400,
      fontSize: isPublic ? 11 : 9,
      cursor: (busy ? "wait" : "pointer") as "wait" | "pointer",
      opacity: busy ? 0.6 : 1,
      color: (privateActive
        ? PRIVATE_FG[response]
        : active && response === "maybe" && isPublic ? "#f59e0b"
        : "inherit") as string,
      transition: "background 0.15s, color 0.15s",
      boxShadow: "none",
    };
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Segmented control: Going + Interested (+ Can't go for private) */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          height: isPublic ? undefined : 72,
          background: isPublic ? "var(--btn-bg)" : "rgba(18,25,36,0.14)",
          borderRadius: isPublic ? 14 : 20,
          border: isPublic ? "none" : "1px solid rgba(255,255,255,0.12)",
          padding: isPublic ? 3 : 5,
          gap: 3,
          boxSizing: "border-box" as const,
        }}>
            {isPublic ? (
            <>
              {/* Going */}
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("going"); }}
                style={segmentStyle("going")}
              >
                <GoingIcon size={14} />
                <span>
                  Going{counts.going > 0 && <span style={{ opacity: 0.45, fontSize: 11, marginLeft: 4 }}>{counts.going}</span>}
                </span>
              </button>

              {/* Interested */}
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("maybe"); }}
                style={segmentStyle("maybe")}
              >
                <StarIcon filled={myResponse === "maybe"} />
                <span>
                  Interested{counts.maybe > 0 && <span style={{ opacity: 0.45, fontSize: 11, marginLeft: 4 }}>{counts.maybe}</span>}
                </span>
              </button>
            </>
          ) : (
            <>
              {/* Private: Going / Can't go / Maybe — icon on top, label below */}
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("going"); }}
                style={segmentStyle("going")}
              >
                <GoingIcon size={14} />
                <span style={{ fontSize: 9 }}>Going</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("cant_go"); }}
                style={segmentStyle("cant_go")}
              >
                <CantGoIcon size={14} />
                <span style={{ fontSize: 9 }}>Can&apos;t go</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("maybe"); }}
                style={segmentStyle("maybe")}
              >
                <MaybeIcon size={14} />
                <span style={{ fontSize: 9 }}>Maybe</span>
              </button>
            </>
          )}
        </div>

        {/* Tickets — high-contrast, visually dominant on public events */}
        {hasTickets && (
          <a
            href={sourceUrl!}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 0.8,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "13px 6px",
              borderRadius: 14,
              background: "var(--foreground)",
              color: "var(--background)",
              fontWeight: 700,
              fontSize: 13,
              textDecoration: "none",
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
            <span>Tickets</span>
          </a>
        )}
      </div>

      {/* Sign-in nudge — only shown to logged-out users */}
      {!authLoading && !user && (
        <p style={{ fontSize: 12, opacity: 0.45, textAlign: "center", margin: 0 }}>
          <button
            type="button"
            onClick={openSignIn}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: "inherit",
              color: "inherit",
            }}
          >
            Sign in
          </button>
          {" "}to mark your attendance
        </p>
      )}
    </div>
  );
}

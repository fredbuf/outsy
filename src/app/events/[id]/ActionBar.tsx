"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";
import { GoingIcon, CantGoIcon, MaybeIcon, InterestedIcon, TicketIcon } from "./CustomIcons";

type RsvpResponse = "going" | "maybe" | "cant_go";
type Counts = { going: number; maybe: number; cant_go: number };


export function ActionBar({
  eventId,
  initialCounts,
  sourceUrl,
  visibility,
  previewMode = false,
}: {
  eventId: string;
  initialCounts: Counts;
  sourceUrl: string | null;
  visibility: "public" | "private";
  previewMode?: boolean;
}) {
  const { user, loading: authLoading, session } = useAuth();
  const [, setCounts] = useState<Counts>(initialCounts);
  const [myResponse, setMyResponse] = useState<RsvpResponse | null>(null);
  const [loadingRsvp, setLoadingRsvp] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (previewMode || !session?.access_token) return;
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
  }, [eventId, session?.access_token, previewMode]);

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

  const busy = submitting || loadingRsvp || previewMode;
  const isPublic = visibility === "public";
  const hasTickets = isPublic && !!sourceUrl;

  // Going → green, Interested → orange, Can't go → red
  const PUBLIC_FG: Record<"going" | "maybe", string> = {
    going:  "#10b981",
    maybe:  "#f59e0b",
  };
  const PRIVATE_FG: Record<RsvpResponse, string> = {
    going:   "#10b981",
    maybe:   "#f59e0b",
    cant_go: "#ef4444",
  };

  function publicSegmentStyle(response: "going" | "maybe") {
    const active = myResponse === response;
    return {
      flex: 1,
      alignSelf: "stretch" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 4,
      padding: "12px 8px",
      borderRadius: 16,
      border: active ? "1px solid rgba(59,130,246,0.35)" : "none",
      background: active ? "rgba(59,130,246,0.22)" : "transparent",
      fontWeight: active ? 600 : 400,
      fontSize: 11,
      cursor: (busy ? "wait" : "pointer") as "wait" | "pointer",
      opacity: busy ? 0.6 : 1,
      color: active ? PUBLIC_FG[response] : ("inherit" as string),
      transition: "background 0.15s, color 0.15s, border 0.15s",
      boxShadow: "none",
    };
  }

  function privateSegmentStyle(response: RsvpResponse) {
    const active = myResponse === response;
    return {
      flex: 1,
      alignSelf: "stretch" as const,
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      gap: 4,
      padding: "12px 8px",
      borderRadius: 16,
      border: "none",
      background: active ? "rgba(59,130,246,0.25)" : "transparent",
      fontWeight: active ? 600 : 400,
      fontSize: 11,
      cursor: (busy ? "wait" : "pointer") as "wait" | "pointer",
      opacity: busy ? 0.6 : 1,
      color: active ? PRIVATE_FG[response] : ("inherit" as string),
      transition: "background 0.15s, color 0.15s",
      boxShadow: "none",
    };
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Segmented control */}
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "stretch",
          height: 72,
          background: "rgba(18,25,36,0.14)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.12)",
          padding: 5,
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
                style={publicSegmentStyle("going")}
              >
                <GoingIcon size={18} />
                <span style={{ fontSize: 11 }}>Going</span>
              </button>

              {/* Interested */}
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("maybe"); }}
                style={publicSegmentStyle("maybe")}
              >
                <InterestedIcon size={18} />
                <span style={{ fontSize: 11 }}>Interested</span>
              </button>
            </>
          ) : (
            <>
              {/* Private: Going / Can't go / Maybe */}
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("going"); }}
                style={privateSegmentStyle("going")}
              >
                <GoingIcon size={18} />
                <span style={{ fontSize: 11 }}>Going</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("cant_go"); }}
                style={privateSegmentStyle("cant_go")}
              >
                <CantGoIcon size={18} />
                <span style={{ fontSize: 11 }}>Can&apos;t go</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("maybe"); }}
                style={privateSegmentStyle("maybe")}
              >
                <MaybeIcon size={18} />
                <span style={{ fontSize: 11 }}>Maybe</span>
              </button>
            </>
          )}
        </div>

        {/* Tickets — blue liquid-glass, TicketIcon */}
        {hasTickets && (
          <a
            href={sourceUrl!}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 0.75,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              height: 72,
              borderRadius: 20,
              background: "rgba(59,130,246,0.22)",
              border: "1px solid rgba(59,130,246,0.40)",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 12,
              textDecoration: "none",
              boxSizing: "border-box" as const,
              flexShrink: 0,
            }}
          >
            <TicketIcon size={20} />
            <span>Tickets</span>
          </a>
        )}
      </div>

      {/* Sign-in nudge — only shown to logged-out users, not in preview */}
      {!previewMode && !authLoading && !user && (
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

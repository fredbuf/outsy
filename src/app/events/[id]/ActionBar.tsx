"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";

type RsvpResponse = "going" | "maybe" | "cant_go";
type Counts = { going: number; maybe: number; cant_go: number };

function CheckIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

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

  function rsvpButtonStyle(response: RsvpResponse) {
    const active = myResponse === response;
    return {
      flex: 1,
      display: "flex" as const,
      flexDirection: "column" as const,
      alignItems: "center" as const,
      gap: 4,
      padding: "13px 6px",
      borderRadius: 14,
      border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
      background: active ? "var(--btn-bg)" : "transparent",
      fontWeight: active ? 700 : 400,
      fontSize: 13,
      cursor: (busy ? "wait" : "pointer") as "wait" | "pointer",
      opacity: busy ? 0.6 : 1,
      color: (response === "maybe" && active ? "#f59e0b" : "inherit") as string,
      transition: "background 0.15s, border-color 0.15s",
    };
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8 }}>
        {/* Going */}
        <button
          type="button"
          disabled={busy}
          onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("going"); }}
          style={rsvpButtonStyle("going")}
        >
          <CheckIcon />
          <span>
            Going{counts.going > 0 && <span style={{ opacity: 0.45, fontSize: 11, marginLeft: 4 }}>{counts.going}</span>}
          </span>
        </button>

        {/* Interested — also the "save" / star action */}
        <button
          type="button"
          disabled={busy}
          onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("maybe"); }}
          style={rsvpButtonStyle("maybe")}
        >
          <StarIcon filled={myResponse === "maybe"} />
          <span>
            Interested{counts.maybe > 0 && <span style={{ opacity: 0.45, fontSize: 11, marginLeft: 4 }}>{counts.maybe}</span>}
          </span>
        </button>

        {/* Tickets — high-contrast, visually dominant on public events */}
        {hasTickets ? (
          <a
            href={sourceUrl!}
            target="_blank"
            rel="noreferrer"
            style={{
              flex: 1.3,
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
        ) : !isPublic ? (
          /* Private events: show Can't go instead */
          <button
            type="button"
            disabled={busy}
            onClick={() => { if (!user) { openSignIn(); return; } handleRsvp("cant_go"); }}
            style={rsvpButtonStyle("cant_go")}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            <span>Can&apos;t go</span>
            {counts.cant_go > 0 && <span style={{ opacity: 0.45, fontSize: 11, marginLeft: 4 }}>{counts.cant_go}</span>}
          </button>
        ) : null}
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

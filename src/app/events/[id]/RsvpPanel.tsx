"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../../components/AuthProvider";

type RsvpResponse = "going" | "maybe" | "cant_go";
type RsvpCounts = { going: number; maybe: number; cant_go: number };

const LABELS_PRIVATE: Record<RsvpResponse, string> = {
  going: "Going",
  maybe: "Maybe",
  cant_go: "Can't go",
};

const LABELS_PUBLIC: Record<RsvpResponse, string> = {
  going: "Going",
  maybe: "Interested",
  cant_go: "Can't go",
};

export function RsvpPanel({
  eventId,
  initialCounts,
  visibility,
}: {
  eventId: string;
  initialCounts: RsvpCounts;
  visibility: "public" | "private";
}) {
  const { user, loading: authLoading, session } = useAuth();
  const LABELS = visibility === "private" ? LABELS_PRIVATE : LABELS_PUBLIC;

  const [counts, setCounts] = useState<RsvpCounts>(initialCounts);
  const [myResponse, setMyResponse] = useState<RsvpResponse | null>(null);
  const [loadingRsvp, setLoadingRsvp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch this user's existing RSVP whenever the session becomes available.
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
      .catch(() => {/* counts stay at server-rendered initial values */})
      .finally(() => setLoadingRsvp(false));
  }, [eventId, session?.access_token]);

  async function handleClick(r: RsvpResponse) {
    if (!session?.access_token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ response: r }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to save RSVP.");
      setMyResponse(r);
      setCounts(json.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save RSVP.");
    } finally {
      setSubmitting(false);
    }
  }

  function openSignIn() {
    window.dispatchEvent(new CustomEvent("outsy:open-signin"));
  }

  const busy = submitting || loadingRsvp;

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        borderTop: "1px solid var(--border)",
        paddingTop: 20,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700 }}>RSVP</h2>

      <div style={{ display: "flex", gap: 8 }}>
        {(["going", "maybe", "cant_go"] as const).map((r) => {
          const active = myResponse === r;
          return (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => {
                if (!user) { openSignIn(); return; }
                handleClick(r);
              }}
              style={{
                flex: 1,
                padding: "10px 8px",
                borderRadius: 10,
                border: `1px solid ${active ? "var(--border-strong)" : "var(--border)"}`,
                background: active ? "var(--btn-bg)" : "transparent",
                fontWeight: active ? 700 : 400,
                cursor: busy ? "wait" : "pointer",
                fontSize: 13,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                opacity: busy ? 0.6 : 1,
              }}
            >
              <span>{LABELS[r]}</span>
              <span style={{ opacity: 0.55, fontSize: 12 }}>{counts[r]}</span>
            </button>
          );
        })}
      </div>

      {!authLoading && !user ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>
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
              opacity: "inherit",
            }}
          >
            Sign in
          </button>
          {" "}to RSVP.
        </p>
      ) : myResponse ? (
        <p style={{ fontSize: 13, opacity: 0.6 }}>
          You&apos;re marked as <strong>{LABELS[myResponse]}</strong>. Click another to change.
        </p>
      ) : user && !loadingRsvp ? (
        <p style={{ fontSize: 13, opacity: 0.5 }}>Select a response above.</p>
      ) : null}

      {error && <p style={{ color: "#dc2626", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

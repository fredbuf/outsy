"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
type UiState =
  | "loading"
  | "self"          // viewing own profile — hide the button
  | "none"          // no relationship
  | "pending_sent"  // I sent a request
  | "pending_received" // they sent me a request
  | "friends";

// Maps the raw API status to our UI state
function toUiState(apiStatus: string): UiState {
  switch (apiStatus) {
    case "self":             return "self";
    case "pending_sent":     return "pending_sent";
    case "pending_received": return "pending_received";
    case "friends":          return "friends";
    default:                 return "none";
  }
}

export function FriendshipButton({ profileId }: { profileId: string }) {
  const { user, session, loading: authLoading } = useAuth();
  const [state, setState] = useState<UiState>("loading");
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !session) {
      // Not logged in — hide the button entirely
      setState("self"); // reuse "self" to hide; won't show
      return;
    }
    if (user.id === profileId) {
      setState("self");
      return;
    }
    fetch(`/api/friends/status?userId=${profileId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((d: { ok: boolean; status?: string; friendshipId?: string }) => {
        if (d.ok) {
          setState(toUiState(d.status ?? "none"));
          setFriendshipId(d.friendshipId ?? null);
        }
      })
      .catch(() => setState("none"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session?.access_token, profileId]);

  async function sendRequest() {
    if (!session) return;
    setActing(true);
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ recipientId: profileId }),
      });
      const d = (await res.json()) as { ok: boolean; friendshipStatus?: string };
      if (d.ok) {
        setState(d.friendshipStatus === "friends" ? "friends" : "pending_sent");
      }
    } finally {
      setActing(false);
    }
  }

  async function acceptRequest() {
    if (!session || !friendshipId) return;
    setActing(true);
    try {
      const res = await fetch("/api/social/activity/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ friendshipId, action: "accept" }),
      });
      const d = (await res.json()) as { ok: boolean };
      if (d.ok) setState("friends");
    } finally {
      setActing(false);
    }
  }

  // Don't render anything for self, loading (avoid flash), or unauthenticated
  if (state === "loading" || state === "self") return null;

  const baseStyle: React.CSSProperties = {
    padding: "8px 20px", borderRadius: 20, fontWeight: 600,
    fontSize: 14, cursor: acting ? "not-allowed" : "pointer",
    opacity: acting ? 0.6 : 1, transition: "opacity 0.15s",
  };

  if (state === "friends") {
    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ ...baseStyle, background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)", cursor: "default", display: "inline-flex", alignItems: "center", gap: 5 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Friends
        </span>
        <Link
          href={`/social/messages/${profileId}`}
          style={{ ...baseStyle, background: "var(--btn-bg)", border: "1px solid var(--border-strong)", textDecoration: "none", color: "inherit", display: "inline-block" }}
        >
          Message
        </Link>
      </div>
    );
  }

  if (state === "pending_sent") {
    return (
      <span style={{ ...baseStyle, background: "var(--surface-raised)", border: "1px solid var(--border)", cursor: "default", opacity: 0.6, display: "inline-block" }}>
        Request sent
      </span>
    );
  }

  if (state === "pending_received") {
    return (
      <button
        type="button"
        onClick={acceptRequest}
        disabled={acting}
        style={{ ...baseStyle, background: "var(--accent)", color: "#fff", border: "none" }}
      >
        {acting ? "Accepting…" : "Accept request"}
      </button>
    );
  }

  // none — show Add friend
  return (
    <button
      type="button"
      onClick={sendRequest}
      disabled={acting}
      style={{ ...baseStyle, background: "var(--accent)", color: "#fff", border: "none" }}
    >
      {acting ? "Sending…" : "Add friend"}
    </button>
  );
}

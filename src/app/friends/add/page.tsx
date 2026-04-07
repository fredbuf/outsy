/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/app/components/AuthProvider";
import type { UserSearchResult } from "@/app/api/users/search/route";

// ── Avatar helpers ─────────────────────────────────────────────────────────────

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

// ── Local state ────────────────────────────────────────────────────────────────

// What state to show on a result's button
type ButtonState = "idle" | "sending" | "sent" | "cancelling" | "friends";

function initialButtonState(result: UserSearchResult): ButtonState {
  if (!result.friendship) return "idle";
  if (result.friendship.status === "accepted") return "friends";
  if (result.friendship.direction === "sent") return "sent";
  // direction === 'received': they requested me → show "Add friend" which will accept
  return "idle";
}

// ── Components ─────────────────────────────────────────────────────────────────

function Avatar({ result }: { result: UserSearchResult }) {
  const label = result.display_name ?? result.username ?? null;
  return result.avatar_url ? (
    <img
      src={result.avatar_url}
      alt={label ?? ""}
      style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: 44, height: 44, borderRadius: "50%",
        background: getAvatarColor(label),
        flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 15, fontWeight: 700,
        color: "#fff", userSelect: "none",
      }}
    >
      {getInitials(label)}
    </div>
  );
}

function AddButton({
  state,
  onAdd,
  onCancel,
}: {
  state: ButtonState;
  onAdd: () => void;
  onCancel: () => void;
}) {
  if (state === "friends") {
    return (
      <span
        style={{
          fontSize: 13, fontWeight: 600,
          color: "#10b981",
          display: "flex", alignItems: "center", gap: 4,
          flexShrink: 0,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Friends
      </span>
    );
  }

  if (state === "sent" || state === "cancelling") {
    return (
      <button
        type="button"
        onClick={onCancel}
        disabled={state === "cancelling"}
        style={{
          padding: "7px 16px",
          borderRadius: 20,
          border: "1px solid var(--border-strong)",
          background: "var(--btn-bg)",
          fontWeight: 600,
          fontSize: 13,
          cursor: state === "cancelling" ? "not-allowed" : "pointer",
          flexShrink: 0,
          transition: "opacity 0.15s",
          opacity: state === "cancelling" ? 0.5 : 1,
        }}
      >
        {state === "cancelling" ? "Cancelling…" : "Cancel request"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={state === "sending"}
      style={{
        padding: "7px 16px",
        borderRadius: 20,
        border: "none",
        background: state === "sending" ? "var(--surface-raised)" : "var(--accent)",
        color: "#fff",
        fontWeight: 600,
        fontSize: 13,
        cursor: state === "sending" ? "not-allowed" : "pointer",
        flexShrink: 0,
        transition: "opacity 0.15s",
        opacity: state === "sending" ? 0.5 : 1,
      }}
    >
      {state === "sending" ? "Sending…" : "Add friend"}
    </button>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AddFriendPage() {
  const { user, session, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserSearchResult[] | null>(null);
  const [buttonStates, setButtonStates] = useState<Record<string, ButtonState>>({});
  const [friendshipIds, setFriendshipIds] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // 300ms debounce on input
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Fetch results when debounced query changes
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < 2) {
      setResults(null);
      return;
    }
    if (!session) return;

    setSearching(true);
    fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((data: { ok: boolean; results?: UserSearchResult[] }) => {
        if (data.ok && data.results) {
          setResults(data.results);
          // Seed button states and friendship IDs from friendship data
          const initial: Record<string, ButtonState> = {};
          const ids: Record<string, string> = {};
          for (const r of data.results) {
            initial[r.id] = initialButtonState(r);
            if (r.friendship?.id) ids[r.id] = r.friendship.id;
          }
          setButtonStates(initial);
          setFriendshipIds(ids);
        }
      })
      .finally(() => setSearching(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, session?.access_token]);

  async function handleAdd(result: UserSearchResult) {
    if (!session) return;
    setButtonStates((prev) => ({ ...prev, [result.id]: "sending" }));
    try {
      const res = await fetch("/api/friends/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ recipientId: result.id }),
      });
      const data = (await res.json()) as { ok: boolean; friendshipStatus?: string; friendshipId?: string };
      if (data.ok) {
        const next: ButtonState =
          data.friendshipStatus === "friends" ? "friends" : "sent";
        setButtonStates((prev) => ({ ...prev, [result.id]: next }));
        if (data.friendshipId) {
          setFriendshipIds((prev) => ({ ...prev, [result.id]: data.friendshipId! }));
        }
      } else {
        // Revert to idle on error so the user can retry
        setButtonStates((prev) => ({ ...prev, [result.id]: "idle" }));
      }
    } catch {
      setButtonStates((prev) => ({ ...prev, [result.id]: "idle" }));
    }
  }

  async function handleCancel(userId: string) {
    if (!session) return;
    const friendshipId = friendshipIds[userId];
    if (!friendshipId) return;
    setButtonStates((prev) => ({ ...prev, [userId]: "cancelling" }));
    try {
      const res = await fetch("/api/friends/remove", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ friendshipId }),
      });
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) {
        setButtonStates((prev) => ({ ...prev, [userId]: "idle" }));
        setFriendshipIds((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      } else {
        setButtonStates((prev) => ({ ...prev, [userId]: "sent" }));
      }
    } catch {
      setButtonStates((prev) => ({ ...prev, [userId]: "sent" }));
    }
  }

  if (loading) return null;

  if (!user) {
    return (
      <main className="app-page" style={{ maxWidth: 480, margin: "0 auto", padding: "48px 16px", textAlign: "center" }}>
        <div className="page-top-glow" aria-hidden="true" />
        <p style={{ fontSize: 15, opacity: 0.6 }}>Sign in to find friends.</p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("outsy:open-signin"))}
          style={{
            marginTop: 16, padding: "9px 24px", borderRadius: 20,
            border: "1px solid var(--border-strong)",
            background: "var(--btn-bg)", fontWeight: 600, fontSize: 14, cursor: "pointer",
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  const trimmedQuery = query.trim();
  const showEmpty = results !== null && results.length === 0 && !searching;
  const showResults = results !== null && results.length > 0;

  return (
    <main
      className="page-main app-page"
      style={{ maxWidth: 540, margin: "0 auto", padding: "24px 16px 56px" }}
    >
      <div className="page-top-glow" aria-hidden="true" />
      {/* Back */}
      <Link href="/profile" style={{ opacity: 0.55, fontSize: 14, textDecoration: "none", display: "block", marginBottom: 20 }}>
        ← Back
      </Link>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>Add friend</h1>
        <p style={{ fontSize: 14, opacity: 0.5, margin: 0 }}>Search by name or username.</p>
      </div>

      {/* Search input */}
      <div style={{ position: "relative", marginBottom: 8 }}>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="search"
          autoComplete="off"
          autoFocus
          placeholder="Search by name or username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%",
            padding: "11px 14px 11px 40px",
            borderRadius: 12,
            border: "1px solid var(--border-strong)",
            background: "var(--surface-subtle)",
            fontSize: 16,
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
            aria-label="Clear search"
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", opacity: 0.4, fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Loading */}
      {searching && (
        <p style={{ fontSize: 13, opacity: 0.4, padding: "8px 0" }}>Searching…</p>
      )}

      {/* Results */}
      {showResults && (
        <div style={{ marginTop: 8 }}>
          {results!.map((result) => {
            const label = result.display_name ?? result.username ?? "Unknown";
            const btnState = buttonStates[result.id] ?? "idle";
            return (
              <div
                key={result.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", borderBottom: "1px solid var(--border)",
                }}
              >
                <Link href={`/profile/${result.id}`} style={{ flexShrink: 0, lineHeight: 0 }}>
                  <Avatar result={result} />
                </Link>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link href={`/profile/${result.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {label}
                    </div>
                    {result.username && result.display_name && (
                      <div style={{ fontSize: 12, opacity: 0.45, marginTop: 1 }}>
                        @{result.username}
                      </div>
                    )}
                  </Link>
                </div>
                <AddButton state={btnState} onAdd={() => handleAdd(result)} onCancel={() => handleCancel(result.id)} />
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && trimmedQuery.length >= 2 && (
        <div style={{ padding: "40px 0", textAlign: "center", opacity: 0.5 }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: "block", margin: "0 auto 10px" }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>No users found</p>
        </div>
      )}

      {/* Hint when input too short */}
      {!searching && trimmedQuery.length > 0 && trimmedQuery.length < 2 && (
        <p style={{ fontSize: 13, opacity: 0.4, padding: "8px 0" }}>Keep typing…</p>
      )}
    </main>
  );
}

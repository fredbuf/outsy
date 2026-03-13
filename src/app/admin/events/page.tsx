"use client";

import { useState, useCallback } from "react";

type PendingEvent = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  source_url: string | null;
  created_at: string | null;
  venues: { name: string } | null;
};

type ActionState = "idle" | "loading";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminEventsPage() {
  const [adminKey, setAdminKey] = useState("");
  const [events, setEvents] = useState<PendingEvent[]>([]);
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, ActionState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const fetchPending = useCallback(
    async (key: string) => {
      setFetchState("loading");
      setFetchError(null);
      try {
        const res = await fetch("/api/admin/events/pending", {
          headers: { Authorization: `Bearer ${key}` },
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setFetchError(json.error ?? "Failed to fetch events.");
          setFetchState("error");
          return;
        }
        setEvents(json.events);
        setFetchState("done");
      } catch {
        setFetchError("Network error.");
        setFetchState("error");
      }
    },
    []
  );

  async function handleAction(
    eventId: string,
    action: "approve" | "reject"
  ) {
    setRowStates((s) => ({ ...s, [eventId]: "loading" }));
    setRowErrors((e) => ({ ...e, [eventId]: "" }));

    const endpoint =
      action === "approve"
        ? "/api/admin/events/approve"
        : "/api/admin/events/reject";

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminKey}`,
        },
        body: JSON.stringify({ event_id: eventId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setRowErrors((e) => ({ ...e, [eventId]: json.error ?? "Action failed." }));
        setRowStates((s) => ({ ...s, [eventId]: "idle" }));
        return;
      }
      // Remove the actioned row from list
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      setRowStates((s) => {
        const next = { ...s };
        delete next[eventId];
        return next;
      });
    } catch {
      setRowErrors((e) => ({ ...e, [eventId]: "Network error." }));
      setRowStates((s) => ({ ...s, [eventId]: "idle" }));
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
        Pending Event Submissions
      </h1>
      <p style={{ opacity: 0.6, marginBottom: 24, fontSize: 14 }}>
        Approve or reject manually submitted events before they appear on /events.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label htmlFor="admin-key" style={{ fontSize: 13, fontWeight: 600 }}>
            Admin key
          </label>
          <input
            id="admin-key"
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Paste INGEST_SECRET here"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              width: 280,
              fontFamily: "monospace",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && adminKey.trim()) fetchPending(adminKey.trim());
            }}
          />
        </div>
        <button
          onClick={() => fetchPending(adminKey.trim())}
          disabled={!adminKey.trim() || fetchState === "loading"}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            background: "#111",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {fetchState === "loading" ? "Loading…" : "Load pending"}
        </button>
        {fetchState === "done" && (
          <button
            onClick={() => fetchPending(adminKey.trim())}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>
        )}
      </div>

      {fetchState === "error" && (
        <p style={{ color: "#c00", marginBottom: 16 }}>{fetchError}</p>
      )}

      {fetchState === "done" && events.length === 0 && (
        <p style={{ opacity: 0.6 }}>No pending submissions.</p>
      )}

      {events.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 14,
            }}
          >
            <thead>
              <tr style={{ borderBottom: "2px solid var(--border)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px" }}>Title</th>
                <th style={{ padding: "8px 12px" }}>Start</th>
                <th style={{ padding: "8px 12px" }}>Category</th>
                <th style={{ padding: "8px 12px" }}>Venue</th>
                <th style={{ padding: "8px 12px" }}>Link</th>
                <th style={{ padding: "8px 12px" }}>Submitted</th>
                <th style={{ padding: "8px 12px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const busy = rowStates[e.id] === "loading";
                return (
                  <tr
                    key={e.id}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <td style={{ padding: "10px 12px", fontWeight: 600, maxWidth: 260 }}>
                      {e.title}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      {formatDate(e.start_at)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>{e.category_primary}</td>
                    <td style={{ padding: "10px 12px" }}>
                      {e.venues?.name ?? <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {e.source_url ? (
                        <a
                          href={e.source_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#0070f3" }}
                        >
                          Link
                        </a>
                      ) : (
                        <span style={{ opacity: 0.4 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", opacity: 0.7 }}>
                      {formatDate(e.created_at)}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <button
                          onClick={() => handleAction(e.id, "approve")}
                          disabled={busy}
                          style={{
                            padding: "5px 14px",
                            borderRadius: 6,
                            background: "#16a34a",
                            color: "#fff",
                            border: "none",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          {busy ? "…" : "Approve"}
                        </button>
                        <button
                          onClick={() => handleAction(e.id, "reject")}
                          disabled={busy}
                          style={{
                            padding: "5px 14px",
                            borderRadius: 6,
                            background: "#dc2626",
                            color: "#fff",
                            border: "none",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontWeight: 600,
                            fontSize: 13,
                          }}
                        >
                          {busy ? "…" : "Reject"}
                        </button>
                        {rowErrors[e.id] && (
                          <span style={{ color: "#c00", fontSize: 12 }}>
                            {rowErrors[e.id]}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────────────

export type PublicEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Detail sheet (same pattern as own profile) ─────────────────────────────────

function DetailSheet({
  title,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder,
  children,
}: {
  title: string;
  onClose: () => void;
  search: string;
  onSearchChange: (v: string) => void;
  searchPlaceholder: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
    >
      <div style={{ background: "var(--background)", borderRadius: "20px 20px 0 0", width: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0", flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 0", flexShrink: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface-raised)", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.6, color: "inherit" }}
          >
            ×
          </button>
        </div>
        <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 16, background: "var(--surface-raised)", color: "inherit", outline: "none" }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1, padding: "12px 20px 36px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicProfileCounters({
  friendsCount,
  followingCount,
  eventsCount,
  events,
}: {
  friendsCount: number;
  followingCount: number;
  eventsCount: number;
  events: PublicEvent[];
}) {
  const [activeSheet, setActiveSheet] = useState<"friends" | "following" | "events" | null>(null);
  const [sheetSearch, setSheetSearch] = useState("");

  useEffect(() => {
    document.body.style.overflow = activeSheet !== null ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [activeSheet]);

  return (
    <>
      {/* Counter row */}
      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: 300,
          marginTop: 8,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          onClick={() => { setActiveSheet("friends"); setSheetSearch(""); }}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{friendsCount}</span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Friends</span>
        </button>
        <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
        <button
          type="button"
          onClick={() => { setActiveSheet("following"); setSheetSearch(""); }}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{followingCount}</span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Following</span>
        </button>
        <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />
        <button
          type="button"
          onClick={() => { setActiveSheet("events"); setSheetSearch(""); }}
          style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 4px", color: "inherit" }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{eventsCount}</span>
          <span style={{ fontSize: 12, opacity: 0.5 }}>Events</span>
        </button>
      </div>

      {/* Friends sheet — count is shown, list is private for now */}
      {activeSheet === "friends" && (
        <DetailSheet
          title={`Friends · ${friendsCount}`}
          onClose={() => setActiveSheet(null)}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search…"
        >
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>Friends list is private.</p>
          </div>
        </DetailSheet>
      )}

      {/* Following sheet */}
      {activeSheet === "following" && (
        <DetailSheet
          title="Following"
          onClose={() => setActiveSheet(null)}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search…"
        >
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <p style={{ opacity: 0.45, fontSize: 14, margin: 0 }}>Following venues and organizers coming soon.</p>
          </div>
        </DetailSheet>
      )}

      {/* Events sheet — their upcoming public events */}
      {activeSheet === "events" && (
        <DetailSheet
          title={`Events · ${eventsCount}`}
          onClose={() => setActiveSheet(null)}
          search={sheetSearch}
          onSearchChange={setSheetSearch}
          searchPlaceholder="Search events…"
        >
          {(() => {
            const q = sheetSearch.toLowerCase();
            const filtered = events.filter((e) => !q || e.title.toLowerCase().includes(q));
            if (events.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No upcoming public events.</p>;
            }
            if (filtered.length === 0) {
              return <p style={{ opacity: 0.45, fontSize: 14, margin: "16px 0 0" }}>No results for &ldquo;{sheetSearch}&rdquo;</p>;
            }
            return (
              <div>
                {filtered.map((e) => (
                  <Link
                    key={e.id}
                    href={`/events/${e.id}`}
                    onClick={() => setActiveSheet(null)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--border)" }}
                  >
                    <div style={{ width: 44, height: 36, borderRadius: 8, overflow: "hidden", background: "var(--surface-raised)", flexShrink: 0 }}>
                      {e.image_url && (
                        <img src={e.image_url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.title}</div>
                      <div style={{ fontSize: 11, opacity: 0.45, marginTop: 2 }}>{formatDate(e.start_at)}</div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </DetailSheet>
      )}
    </>
  );
}

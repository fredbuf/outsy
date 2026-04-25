/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useTileTransition } from "@/app/components/TileTransitionProvider";
import type { CategoryEventRow } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tz = "America/Toronto";
  const toKey = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: tz });
  const eventDay = toKey(d);
  const today = toKey(now);
  const tomorrow = toKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
  const timeStr = rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();
  if (eventDay === today) return `Today · ${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow · ${timeStr}`;
  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    const weekday = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
    return `${weekday} · ${timeStr}`;
  }
  const monthDay = d.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
  return `${monthDay} · ${timeStr}`;
}

function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts": return "#0D1520";
    case "nightlife": return "#0A1018";
    case "arts_culture": return "#0E1319";
    case "comedy": return "#0F1318";
    case "sports": return "#0A1216";
    case "family": return "#0C1220";
    default: return "#0B0F14";
  }
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("input");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoryEventsPage({
  title,
  events,
}: {
  title: string;
  events: CategoryEventRow[];
}) {
  const router = useRouter();
  const { user, session } = useAuth();
  const { triggerTransition } = useTileTransition();

  function handleRowClick(
    ev: React.MouseEvent<HTMLAnchorElement>,
    imageUrl: string | null,
    category: string,
    href: string,
  ) {
    ev.preventDefault();
    const rect = ev.currentTarget.getBoundingClientRect();
    triggerTransition({
      rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      imageUrl,
      category,
    });
    router.push(href);
  }

  // Page transition
  const [closing, setClosing] = useState(false);

  // Starred / interested state
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [starPending, setStarPending] = useState<Set<string>>(new Set());

  // Row menu
  const [menuEventId, setMenuEventId] = useState<string | null>(null);
  const [menuClosing, setMenuClosing] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load user's "maybe" RSVPs on mount
  useEffect(() => {
    if (!user?.id) { setStarredIds(new Set()); return; }
    supabaseBrowser()
      .from("rsvps")
      .select("event_id")
      .eq("user_id", user.id)
      .eq("response", "maybe")
      .then(({ data }) => {
        setStarredIds(new Set((data ?? []).map((r: { event_id: string }) => r.event_id)));
      });
  }, [user?.id]);

  function handleBack() {
    setClosing(true);
    setTimeout(() => {
      if (window.history.length > 1) router.back();
      else router.push("/events");
    }, 240);
  }

  async function handleStar(eventId: string) {
    if (!session?.access_token) {
      window.dispatchEvent(new CustomEvent("outsy:open-signin"));
      return;
    }
    if (starPending.has(eventId)) return;
    const wasStarred = starredIds.has(eventId);
    setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.delete(eventId); } else { s.add(eventId); } return s; });
    setStarPending((prev) => new Set(prev).add(eventId));
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: wasStarred ? "DELETE" : "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        ...(wasStarred ? {} : { body: JSON.stringify({ response: "maybe" }) }),
      });
      if (!res.ok) {
        setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
      }
    } catch {
      setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
    } finally {
      setStarPending((prev) => { const s = new Set(prev); s.delete(eventId); return s; });
    }
  }

  function openMenu(eventId: string, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    setMenuClosing(false);
    setMenuEventId(eventId);
  }

  function closeMenu() {
    setMenuClosing(true);
    setTimeout(() => { setMenuEventId(null); setMenuClosing(false); }, 240);
  }

  async function handleShare(event: CategoryEventRow, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    closeMenu();
    const url = `${window.location.origin}/events/${event.id}`;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ title: event.title, url }); return; } catch { /* cancelled */ }
    }
    await copyToClipboard(url);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    setCopiedId(event.id);
    copyTimer.current = setTimeout(() => setCopiedId(null), 2000);
  }

  const menuEvent = menuEventId ? events.find((e) => e.id === menuEventId) ?? null : null;

  return (
    <>
      <main
        className={`app-page ${closing ? "page-slide-exit" : "page-slide-enter"}`}
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          maxWidth: 980,
          margin: "0 auto",
          border: "1.5px solid rgba(255,255,255,0.10)",
          boxShadow: "0 24px 64px 0 rgba(0,0,0,0.60)",
          overflowX: "hidden",
        }}
      >
        <div className="app-bg-gradient" aria-hidden="true" />

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "44px 1fr 44px",
          alignItems: "center",
          padding: "16px 16px 12px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "#F5F7FA",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 style={{
            fontSize: 17, fontWeight: 700, color: "#F5F7FA",
            textAlign: "center", margin: 0, letterSpacing: "-0.02em",
          }}>
            {title}
          </h1>
          <div />
        </div>

        {/* ── Event list ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {events.length === 0 ? (
            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.38)", fontSize: 14, padding: "48px 24px" }}>
              No events right now.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: "8px 0" }}>
              {events.map((e, idx) => {
                const starred = starredIds.has(e.id);
                const copied = copiedId === e.id;
                const venueStr = e.venues?.city
                  ? `${e.venues.name}, ${e.venues.city}`
                  : e.venues?.name ?? null;
                const subtitleParts = [smartDate(e.start_at), venueStr].filter(Boolean);

                return (
                  <li key={e.id}>
                    {/* Separator — skip first */}
                    {idx > 0 && (
                      <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 16px" }} />
                    )}
                    <Link
                      href={`/events/${e.id}`}
                      onClick={(ev) => handleRowClick(ev, e.image_url, e.category_primary, `/events/${e.id}`)}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                    >
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 16px",
                        transition: "background 0.12s ease",
                      }}>
                        {/* Thumbnail */}
                        <div style={{
                          width: 52, height: 52, borderRadius: 10,
                          overflow: "hidden", flexShrink: 0,
                          background: categoryBg(e.category_primary),
                          position: "relative",
                        }}>
                          {e.image_url && (
                            <img
                              src={e.image_url}
                              alt=""
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          )}
                        </div>

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 700, color: "#F5F7FA",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            lineHeight: 1.3,
                          }}>
                            {e.title}
                          </div>
                          <div style={{
                            fontSize: 12, fontWeight: 400,
                            color: "rgba(199,208,219,0.72)",
                            marginTop: 3, lineHeight: 1.3,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {subtitleParts.join("  ·  ")}
                          </div>
                        </div>

                        {/* Interested pill */}
                        {starred && (
                          <div style={{
                            flexShrink: 0,
                            fontSize: 10, fontWeight: 600,
                            color: "#5EA8FF",
                            background: "rgba(94,168,255,0.12)",
                            border: "1px solid rgba(94,168,255,0.25)",
                            borderRadius: 20,
                            padding: "3px 8px",
                            whiteSpace: "nowrap",
                          }}>
                            Interested
                          </div>
                        )}

                        {/* Copied feedback */}
                        {copied && (
                          <div style={{
                            flexShrink: 0,
                            fontSize: 10, fontWeight: 600,
                            color: "#4ade80",
                            background: "rgba(74,222,128,0.10)",
                            border: "1px solid rgba(74,222,128,0.22)",
                            borderRadius: 20,
                            padding: "3px 8px",
                            whiteSpace: "nowrap",
                          }}>
                            Copied!
                          </div>
                        )}

                        {/* 3-dot menu button */}
                        <button
                          type="button"
                          aria-label="More options"
                          onClick={(ev) => openMenu(e.id, ev)}
                          style={{
                            flexShrink: 0,
                            width: 32, height: 32, borderRadius: "50%",
                            background: "none", border: "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: "rgba(255,255,255,0.40)",
                            padding: 0,
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      {/* ── Row action menu ─────────────────────────────────────────────── */}
      {menuEventId && menuEvent && (
        <div
          onClick={(ev) => { if (ev.target === ev.currentTarget) closeMenu(); }}
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end",
          }}
        >
          <div
            className={menuClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              overflow: "hidden",
            }}
          >
            {/* Handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.30)" }} />
            </div>

            {/* Event title preview */}
            <div style={{
              padding: "14px 20px 12px",
              borderBottom: "1px solid rgba(255,255,255,0.07)",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                background: categoryBg(menuEvent.category_primary),
                position: "relative",
              }}>
                {menuEvent.image_url && (
                  <img src={menuEvent.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#F5F7FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {menuEvent.title}
                </div>
                <div style={{ fontSize: 12, color: "rgba(199,208,219,0.60)", marginTop: 2 }}>
                  {smartDate(menuEvent.start_at)}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ padding: "8px 0", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
              {/* Share */}
              <button
                type="button"
                onClick={(ev) => handleShare(menuEvent, ev)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 20px", background: "none", border: "none",
                  cursor: "pointer", color: "#F5F7FA", textAlign: "left", fontFamily: "inherit",
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 500 }}>Share</span>
              </button>

              {/* Interested / Remove interest */}
              <button
                type="button"
                onClick={async (ev) => {
                  ev.preventDefault();
                  closeMenu();
                  await handleStar(menuEvent.id);
                }}
                disabled={starPending.has(menuEvent.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 16,
                  padding: "14px 20px", background: "none", border: "none",
                  cursor: starPending.has(menuEvent.id) ? "not-allowed" : "pointer",
                  color: starredIds.has(menuEvent.id) ? "#5EA8FF" : "#F5F7FA",
                  textAlign: "left", fontFamily: "inherit",
                  opacity: starPending.has(menuEvent.id) ? 0.5 : 1,
                }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                  background: starredIds.has(menuEvent.id) ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.08)",
                  border: `1px solid ${starredIds.has(menuEvent.id) ? "rgba(94,168,255,0.28)" : "rgba(255,255,255,0.12)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="16" height="16" viewBox="0 0 18 18" fill={starredIds.has(menuEvent.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path fillRule="evenodd" clipRule="evenodd" d="M8.81244 3.375C8.74419 3.375 8.57619 3.39375 8.48694 3.57225L7.11744 6.3105C6.90069 6.74325 6.48294 7.044 5.99994 7.113L2.93394 7.55475C2.73144 7.584 2.66244 7.734 2.64144 7.797C2.62269 7.85775 2.59269 8.01225 2.73219 8.14575L4.94919 10.2758C5.30244 10.6155 5.46294 11.1053 5.37894 11.5845L4.85694 14.592C4.82469 14.7802 4.94244 14.8897 4.99494 14.9272C5.05044 14.9692 5.19894 15.0525 5.38269 14.9565L8.12394 13.5353C8.55594 13.3125 9.07044 13.3125 9.50094 13.5353L12.2414 14.9557C12.4259 15.051 12.5744 14.9677 12.6307 14.9272C12.6832 14.8897 12.8009 14.7802 12.7687 14.592L12.2452 11.5845C12.1612 11.1053 12.3217 10.6155 12.6749 10.2758L14.8919 8.14575C15.0322 8.01225 15.0022 7.857 14.9827 7.797C14.9624 7.734 14.8934 7.584 14.6909 7.55475L11.6249 7.113C11.1427 7.044 10.7249 6.74325 10.5082 6.30975L9.13719 3.57225C9.04869 3.39375 8.88069 3.375 8.81244 3.375Z" />
                  </svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 500 }}>
                  {starredIds.has(menuEvent.id) ? "Remove interest" : "Interested"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

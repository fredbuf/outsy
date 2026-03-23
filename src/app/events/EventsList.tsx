/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const PAGE_SIZE = 50;

type Category = "music" | "nightlife" | "art";
type SourceType = "ticketmaster" | "manual" | "eventbrite" | "venue_newcitygas" | "venue_sat";


type EventRow = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  category_primary: Category;
  source: SourceType;
  min_price: number | null;
  max_price: number | null;
  image_url: string | null;
  source_url: string | null;
  venues: { name: string; city: string | null } | null;
};

type SuggestionItem = { id: string; title: string };
type VenueItem = { id: string; name: string };
type DateWindow = "all" | "today" | "this_week" | "weekend";

// ─── Timezone helpers ────────────────────────────────────────────────────────

function montrealDayStart(dateStr: string): string {
  const noonUtc = new Date(`${dateStr}T12:00:00.000Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(noonUtc);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const s = Number(parts.find((p) => p.type === "second")?.value ?? "0");
  return new Date(noonUtc.getTime() - (h * 3600 + m * 60 + s) * 1000).toISOString();
}

function montrealDayEnd(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const nextDayUtc = new Date(Date.UTC(year, month - 1, day + 1));
  return new Date(new Date(montrealDayStart(nextDayUtc.toISOString().slice(0, 10))).getTime() - 1).toISOString();
}

// ─── Search helpers ───────────────────────────────────────────────────────────

function escapeIlike(s: string): string {
  return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function normalizeStr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Word-overlap similarity score between a search query and a candidate title.
// Returns 0 if there is no meaningful overlap.
function wordOverlapScore(query: string, title: string): number {
  const qNorm = normalizeStr(query);
  const tNorm = normalizeStr(title);
  const qWords = qNorm.split(/\s+/).filter((w) => w.length >= 3);
  if (qWords.length === 0) return 0;
  const tWordSet = new Set(tNorm.split(/\s+/).filter(Boolean));
  let score = 0;
  for (const w of qWords) {
    if (tWordSet.has(w)) score += 2;          // exact word match
    else if (tNorm.includes(w)) score += 1;   // substring match inside title
  }
  return score;
}

// Levenshtein distance — O(m·n) time, O(n) space, no dependencies.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

// Fuzzy score against a title (lower = better, Infinity = no match).
//
// Algorithm:
//   For each QUERY token (≥3 chars), find the closest TITLE token by Levenshtein.
//   A query token "passes" if:
//     • token length ≤10 chars  → best distance ≤ 2
//     • token length  >10 chars → 1 - bestDist/tokenLen ≥ 0.75
//   Only UNMATCHED QUERY tokens add a penalty; extra title tokens are ignored.
//
// Regression checklist:
//   ✓ "Einaude"           → matches "Ludovico Einaudi" (lev("einaude","einaudi") = 1 ≤ 2)
//   ✓ "Ludovico Eniaudi"  → matches "Ludovico Einaudi" (both tokens within threshold)
//   ✗ "xzkjqwp"           → no match (distance to every title token > 2)
function fuzzyScore(query: string, title: string): number {
  const qWords = normalizeStr(query).split(/\s+/).filter((w) => w.length >= 3);
  const tWords = normalizeStr(title).split(/\s+/).filter(Boolean);
  // Nothing to compare.
  if (qWords.length === 0 || tWords.length === 0) return Infinity;

  let totalDist = 0;
  let matched = 0;

  for (const qw of qWords) {
    // Find the closest title token for this query token.
    let bestDist = levenshtein(qw, tWords[0]);
    for (let i = 1; i < tWords.length; i++) {
      const d = levenshtein(qw, tWords[i]);
      if (d < bestDist) bestDist = d;
    }

    const passes =
      qw.length <= 10
        ? bestDist <= 2
        : 1 - bestDist / qw.length >= 0.75;

    if (passes) {
      totalDist += bestDist;
      matched++;
    }
  }

  // No query token matched any title token within threshold.
  if (matched === 0) return Infinity;

  // Average distance across matched query tokens.
  // Penalise only UNMATCHED QUERY tokens so partial matches rank lower than full matches.
  // Extra title tokens carry no penalty.
  return totalDist / matched + (qWords.length - matched) * 5;
}

// ─── Supabase query builder ───────────────────────────────────────────────────

function buildPageQuery(
  supabase: ReturnType<typeof supabaseBrowser>,
  pageIndex: number,
  fromDate: string,
  toDate: string,
  searchQuery: string,
  venueId: string
) {
  const rangeFrom = pageIndex * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let q = supabase
    .from("events")
    .select(
      "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url,venues(name,city)"
    )
    .eq("city_normalized", "montreal")
    .eq("status", "scheduled")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("visibility", "public");

  if (searchQuery) {
    const escaped = escapeIlike(searchQuery.trim());
    // Match against original title and accent-stripped title_normalized.
    q = q.or(`title.ilike.%${escaped}%,title_normalized.ilike.%${escaped}%`);
  }

  if (fromDate) {
    q = q.gte("start_at", montrealDayStart(fromDate));
  } else {
    q = q.gte("start_at", new Date().toISOString());
  }

  if (toDate) {
    q = q.lte("start_at", montrealDayEnd(toDate));
  }

  if (venueId) {
    q = q.eq("venue_id", venueId);
  }

  return q.order("start_at", { ascending: true }).range(rangeFrom, rangeTo);
}

// ─── Client-side filter helpers ───────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isInDateWindow(iso: string, window: DateWindow) {
  if (window === "all") return true;
  const d = new Date(iso);
  const now = new Date();
  if (window === "today") return d.toDateString() === now.toDateString();
  if (window === "this_week") {
    const start = new Date(now);
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  }
  const startWeekend = new Date(now);
  startWeekend.setDate(startWeekend.getDate() + ((5 - startWeekend.getDay() + 7) % 7));
  startWeekend.setHours(0, 0, 0, 0);
  const endWeekend = new Date(startWeekend);
  endWeekend.setDate(endWeekend.getDate() + 3);
  return d >= startWeekend && d < endWeekend;
}


function cardIcon(event: EventRow): string {
  if (event.min_price === 0) return "🌐";
  if (event.min_price !== null || event.source_url) return "🎟";
  return "🌐";
}

// ─── Component ────────────────────────────────────────────────────────────────

type TileRsvpData = {
  counts: Record<string, number>;
  names: Record<string, string[]>;
};

async function fetchTileRsvpData(ids: string[]): Promise<TileRsvpData> {
  if (ids.length === 0) return { counts: {}, names: {} };
  const { data } = await supabaseBrowser()
    .from("rsvps")
    .select("event_id,profiles(display_name)")
    .in("event_id", ids)
    .in("response", ["going", "maybe"])
    .limit(500);

  const counts: Record<string, number> = {};
  const names: Record<string, string[]> = {};

  for (const row of (data ?? []) as {
    event_id: string;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  }[]) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const name = p?.display_name;
    if (name) {
      if (!names[row.event_id]) names[row.event_id] = [];
      // Collect up to 3 first-names for formatting
      if (names[row.event_id].length < 3) {
        names[row.event_id].push(name.split(" ")[0]);
      }
    }
  }

  return { counts, names };
}

function formatRsvpLabel(count: number, names: string[]): string {
  const shown = names.slice(0, 2);
  if (shown.length === 0) return `${count} interested`;
  const rest = count - shown.length;
  if (rest <= 0) return `${shown.join(", ")} interested`;
  return `${shown.join(", ")} + ${rest} interested`;
}

export function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tileRsvp, setTileRsvp] = useState<TileRsvpData>({ counts: {}, names: {} });

  // Typed query (immediate, controls the input).
  const [query, setQuery] = useState("");
  // Debounced version sent to Supabase.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [category, setCategory] = useState<Category | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [venueId, setVenueId] = useState("");
  const [venues, setVenues] = useState<VenueItem[]>([]);

  // Small pool of event titles used to compute "did you mean?" suggestions.
  const [suggestionPool, setSuggestionPool] = useState<SuggestionItem[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasCustomRange = fromDate !== "" || toDate !== "";
  const activeFilterCount = [
    source !== "all",
    venueId !== "",
    hasCustomRange || dateWindow !== "all",
  ].filter(Boolean).length;
  const genRef = useRef(0);

  // Debounce: 300 ms after the last keystroke, commit the query for server fetch.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch venue list once on mount for the venue dropdown.
  useEffect(() => {
    const run = async () => {
      const { data } = await supabaseBrowser()
        .from("venues")
        .select("id,name")
        .order("name", { ascending: true })
        .limit(300);
      setVenues((data ?? []) as VenueItem[]);
    };
    run();
  }, []);

  // Fetch a lightweight title pool once on mount for suggestion computation.
  // No setState synchronously in the effect body — the set happens after await.
  useEffect(() => {
    const run = async () => {
      const { data } = await supabaseBrowser()
        .from("events")
        .select("id,title")
        .eq("city_normalized", "montreal")
        .eq("status", "scheduled")
        .eq("is_approved", true)
        .eq("is_rejected", false)
        .eq("visibility", "public")
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(200);
      setSuggestionPool((data ?? []) as SuggestionItem[]);
    };
    run();
  }, []);

  // Reset + fetch page 0 whenever server-side filters change.
  useEffect(() => {
    const gen = ++genRef.current;

    const run = async () => {
      setLoading(true);
      setFetchError(null);
      setEvents([]);
      setExhausted(false);
      setNextPage(1);

      const { data, error } = await buildPageQuery(
        supabaseBrowser(),
        0,
        fromDate,
        toDate,
        debouncedQuery,
        venueId
      );
      if (gen !== genRef.current) return;
      if (error) {
        console.error(error);
        setFetchError(error.message ?? "Failed to load events.");
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as unknown as EventRow[];
      setEvents(rows);
      if (rows.length < PAGE_SIZE) setExhausted(true);
      setLoading(false);
      fetchTileRsvpData(rows.map((r) => r.id)).then(setTileRsvp);
    };

    run();
  }, [fromDate, toDate, debouncedQuery, venueId]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { data, error } = await buildPageQuery(
      supabaseBrowser(),
      nextPage,
      fromDate,
      toDate,
      debouncedQuery,
      venueId
    );
    if (error) console.error(error);
    const rows = (data ?? []) as unknown as EventRow[];
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...rows.filter((r) => !seen.has(r.id))];
    });
    if (rows.length < PAGE_SIZE) setExhausted(true);
    setNextPage((p) => p + 1);
    setLoadingMore(false);
    fetchTileRsvpData(rows.map((r) => r.id)).then((next) =>
      setTileRsvp((prev) => ({
        counts: { ...prev.counts, ...next.counts },
        names: { ...prev.names, ...next.names },
      }))
    );
  }

  // Text search is now server-side — category/source/date are client-side.
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (category !== "all" && e.category_primary !== category) return false;
      if (source !== "all" && e.source !== source) return false;
      if (!hasCustomRange && !isInDateWindow(e.start_at, dateWindow)) return false;
      return true;
    });
  }, [events, category, source, dateWindow, hasCustomRange]);

  // Suggestions: top-5 titles from the pool, shown only when search returned nothing.
  // Fast path: word overlap. Fallback: fuzzy (Levenshtein) when overlap finds nothing.
  const suggestions = useMemo<SuggestionItem[]>(() => {
    if (!debouncedQuery.trim() || loading || events.length > 0) return [];

    const overlapHits = suggestionPool
      .map((item) => ({ ...item, score: wordOverlapScore(debouncedQuery, item.title) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (overlapHits.length > 0) return overlapHits;

    // Fuzzy fallback — only runs when overlap found nothing.
    return suggestionPool
      .map((item) => ({ ...item, score: fuzzyScore(debouncedQuery, item.title) }))
      .filter((item) => item.score < Infinity)
      .sort((a, b) => a.score - b.score) // ascending: lower distance = better
      .slice(0, 5);
  }, [debouncedQuery, loading, events, suggestionPool]);

  const showEmptySearchState = !loading && debouncedQuery.trim() !== "" && events.length === 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Search + Filters button */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border-strong)",
          }}
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: `1px solid ${activeFilterCount > 0 ? "var(--border-strong)" : "var(--border)"}`,
            background: activeFilterCount > 0 ? "var(--btn-bg)" : "transparent",
            fontWeight: activeFilterCount > 0 ? 700 : 400,
            cursor: "pointer",
            fontSize: 13,
            whiteSpace: "nowrap",
            flexShrink: 0,
            color: "inherit",
          }}
        >
          {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}
        </button>
      </div>

      {/* Category chip row */}
      <div className="chip-row" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {(["all", "music", "nightlife", "art"] as const).map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: "6px 16px",
                borderRadius: 20,
                border: `1px solid ${active ? "var(--foreground)" : "var(--border-strong)"}`,
                background: active ? "var(--foreground)" : "transparent",
                color: active ? "var(--background)" : "inherit",
                fontWeight: active ? 700 : 400,
                fontSize: 13,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {c === "all" ? "All" : c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          );
        })}
      </div>

      {fetchError ? (
        <p style={{ color: "#dc2626" }}>Could not load events: {fetchError}</p>
      ) : loading ? (
        <p>Loading events…</p>
      ) : showEmptySearchState ? (
        /* ── Empty search state ─────────────────────────────────────────── */
        <div style={{ display: "grid", gap: 16, paddingTop: 8 }}>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Doesn&apos;t ring a bell!</p>
          {suggestions.length > 0 && (
            <div style={{ display: "grid", gap: 8 }}>
              <p style={{ fontSize: 13, opacity: 0.6 }}>Did you mean…</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setQuery(s.title)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: "1px solid var(--border-medium)",
                      background: "var(--surface-raised)",
                      cursor: "pointer",
                      fontSize: 13,
                      textAlign: "left",
                    }}
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <div className="events-grid" style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {filtered.map((e) => (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <article
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Image — 70% of card height via padding trick */}
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    paddingBottom: "70%",
                    background: "var(--surface-subtle)",
                    flexShrink: 0,
                  }}
                >
                  {e.image_url && (
                    <img
                      src={e.image_url}
                      alt=""
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  )}
                </div>

                {/* Info area — bottom 30% */}
                <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                  {/* Row 1: date + icon */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, opacity: 0.65 }}>{formatDate(e.start_at)}</span>
                    <span style={{ fontSize: 13, lineHeight: 1 }}>{cardIcon(e)}</span>
                  </div>
                  {/* Row 2: title */}
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {e.title}
                  </div>
                  {/* Row 3: venue or capitalized category fallback */}
                  <div style={{ fontSize: 11, opacity: 0.55, marginTop: 1 }}>
                    {e.venues?.name
                      ? e.venues.city
                        ? `${e.venues.name}, ${e.venues.city}`
                        : e.venues.name
                      : e.category_primary.charAt(0).toUpperCase() + e.category_primary.slice(1)}
                  </div>
                  {(tileRsvp.counts[e.id] ?? 0) > 0 && (
                    <div style={{ fontSize: 11, opacity: 0.4, marginTop: 1 }}>
                      {formatRsvpLabel(tileRsvp.counts[e.id], tileRsvp.names[e.id] ?? [])}
                    </div>
                  )}
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {/* Load more */}
      {!loading && !showEmptySearchState && (
        <div style={{ textAlign: "center", paddingTop: 8 }}>
          {exhausted ? (
            filtered.length > 0 ? (
              <p style={{ opacity: 0.45, fontSize: 14 }}>No more events</p>
            ) : null
          ) : (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              style={{
                padding: "10px 32px",
                borderRadius: 10,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                cursor: loadingMore ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 15,
                opacity: loadingMore ? 0.5 : 1,
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}

      {/* Filters modal */}
      {filtersOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              width: "100%",
              maxWidth: 480,
              maxHeight: "85vh",
              overflowY: "auto",
              display: "grid",
              gap: 16,
              padding: "20px 20px 24px",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Filters</h3>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSource("all");
                      setVenueId("");
                      setDateWindow("all");
                      setFromDate("");
                      setToDate("");
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontSize: 13,
                      opacity: 0.6,
                      textDecoration: "underline",
                      color: "inherit",
                    }}
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="Close"
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, opacity: 0.35 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Source */}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceType | "all")}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 14, background: "var(--background)", color: "inherit" }}
              >
                <option value="all">All sources</option>
                <option value="ticketmaster">Ticketmaster</option>
                <option value="manual">Community</option>
              </select>
            </label>

            {/* Venue */}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Venue</span>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 14, background: "var(--background)", color: "inherit" }}
              >
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>

            {/* Date window */}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Date</span>
              <select
                value={hasCustomRange ? "custom" : dateWindow}
                onChange={(e) => {
                  setFromDate("");
                  setToDate("");
                  setDateWindow(e.target.value as DateWindow);
                }}
                style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 14, background: "var(--background)", color: "inherit" }}
              >
                <option value="all">Any date</option>
                <option value="today">Today</option>
                <option value="this_week">This week</option>
                <option value="weekend">Weekend</option>
                {hasCustomRange && <option value="custom">Custom range</option>}
              </select>
            </label>

            {/* Custom date range */}
            <div style={{ display: "grid", gap: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.6 }}>Custom date range</span>
              <div style={{ display: "flex", gap: 8 }}>
                <label style={{ display: "grid", gap: 3, flex: 1 }}>
                  <span style={{ fontSize: 11, opacity: 0.5 }}>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 14, width: "100%", boxSizing: "border-box" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 3, flex: 1 }}>
                  <span style={{ fontSize: 11, opacity: 0.5 }}>To</span>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    style={{ padding: "9px 10px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 14, width: "100%", boxSizing: "border-box" }}
                  />
                </label>
              </div>
              {hasCustomRange && (
                <button
                  type="button"
                  onClick={() => { setFromDate(""); setToDate(""); }}
                  style={{ alignSelf: "start", padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "transparent", cursor: "pointer", fontSize: 13, color: "inherit" }}
                >
                  Clear dates
                </button>
              )}
            </div>

            {/* Show results */}
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              style={{ padding: "12px", borderRadius: 12, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer" }}
            >
              {loading ? "Loading…" : `Show ${filtered.length}${!exhausted ? "+" : ""} event${filtered.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

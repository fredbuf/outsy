/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const PAGE_SIZE = 50;

type Category = "music" | "nightlife" | "art";
type SourceType = "ticketmaster" | "manual" | "eventbrite";

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
};

type SuggestionItem = { id: string; title: string };
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
  searchQuery: string
) {
  const rangeFrom = pageIndex * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let q = supabase
    .from("events")
    .select(
      "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url"
    )
    .eq("city_normalized", "montreal")
    .eq("status", "scheduled")
    .eq("is_approved", true)
    .eq("is_rejected", false);

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

function cardPriceLabel(event: EventRow): string | null {
  if (event.min_price === 0) return "Free";
  if (event.min_price !== null) {
    const c = "CAD";
    if (event.max_price !== null && event.max_price !== event.min_price)
      return `${c} ${event.min_price} – ${event.max_price}`;
    return `${c} ${event.min_price}`;
  }
  if (event.source_url) return "🎟 Tickets available";
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Typed query (immediate, controls the input).
  const [query, setQuery] = useState("");
  // Debounced version sent to Supabase.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [category, setCategory] = useState<Category | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Small pool of event titles used to compute "did you mean?" suggestions.
  const [suggestionPool, setSuggestionPool] = useState<SuggestionItem[]>([]);

  const hasCustomRange = fromDate !== "" || toDate !== "";
  const genRef = useRef(0);

  // Debounce: 300 ms after the last keystroke, commit the query for server fetch.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

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
        debouncedQuery
      );
      if (gen !== genRef.current) return;
      if (error) {
        console.error(error);
        setFetchError(error.message ?? "Failed to load events.");
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      if (rows.length < PAGE_SIZE) setExhausted(true);
      setLoading(false);
    };

    run();
  }, [fromDate, toDate, debouncedQuery]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { data, error } = await buildPageQuery(
      supabaseBrowser(),
      nextPage,
      fromDate,
      toDate,
      debouncedQuery
    );
    if (error) console.error(error);
    const rows = (data ?? []) as EventRow[];
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      return [...prev, ...rows.filter((r) => !seen.has(r.id))];
    });
    if (rows.length < PAGE_SIZE) setExhausted(true);
    setNextPage((p) => p + 1);
    setLoadingMore(false);
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
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border-strong)" }}
        />

        {/* Row 1: category / source / date preset / price */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as Category | "all")}
            style={{ padding: "8px 10px", borderRadius: 8 }}
          >
            <option value="all">All categories</option>
            <option value="music">Music</option>
            <option value="nightlife">Nightlife</option>
            <option value="art">Art</option>
          </select>

          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceType | "all")}
            style={{ padding: "8px 10px", borderRadius: 8 }}
          >
            <option value="all">All sources</option>
            <option value="ticketmaster">Ticketmaster</option>
            <option value="manual">Community</option>
          </select>

          <select
            value={hasCustomRange ? "all" : dateWindow}
            disabled={hasCustomRange}
            onChange={(e) => setDateWindow(e.target.value as DateWindow)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              opacity: hasCustomRange ? 0.4 : 1,
            }}
          >
            <option value="all">Any date</option>
            <option value="today">Today</option>
            <option value="this_week">This week</option>
            <option value="weekend">Weekend</option>
          </select>

          <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 14 }}>
            {loading
              ? "Loading…"
              : `${filtered.length} event${filtered.length !== 1 ? "s" : ""}${!exhausted ? "+" : ""}`}
          </span>
        </div>

        {/* Row 2: custom date range */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, opacity: 0.7 }}>From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-strong)" }}
          />
          <label style={{ fontSize: 13, opacity: 0.7 }}>To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border-strong)" }}
          />
          {hasCustomRange && (
            <button
              onClick={() => { setFromDate(""); setToDate(""); }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              Clear dates
            </button>
          )}
        </div>
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
        filtered.map((e) => (
          <Link
            key={e.id}
            href={`/events/${e.id}`}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
          <article
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "center",
            }}
          >
            {e.image_url ? (
              <img
                src={e.image_url}
                alt=""
                style={{
                  width: 88,
                  height: 88,
                  objectFit: "cover",
                  borderRadius: 12,
                  flex: "0 0 auto",
                }}
              />
            ) : (
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 12,
                  background: "var(--surface-subtle)",
                  flex: "0 0 auto",
                }}
              />
            )}

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{formatDate(e.start_at)}</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, lineHeight: 1.2 }}>
                {e.title}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                {e.category_primary} • {e.source === "manual" ? "community" : e.source}
                {cardPriceLabel(e) ? ` · ${cardPriceLabel(e)}` : ""}
              </div>
            </div>

          </article>
          </Link>
        ))
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
    </div>
  );
}

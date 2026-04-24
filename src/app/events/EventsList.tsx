/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "../components/AuthProvider";
import { useBottomNav } from "../components/BottomNavContext";

const PAGE_SIZE = 50;

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
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
type DateFilter = "all" | "today" | "this_week" | "weekend" | "pick_date";
type TimeFilter  = "all" | "morning" | "afternoon" | "evening";
type EventType = "all" | "public" | "private";

const DATE_OPTIONS: { id: DateFilter; label: string }[] = [
  { id: "all",       label: "Any date" },
  { id: "today",     label: "Today" },
  { id: "this_week", label: "This week" },
  { id: "weekend",   label: "This weekend" },
  { id: "pick_date", label: "Pick a date" },
];

const TIME_OPTIONS: { id: TimeFilter; label: string }[] = [
  { id: "all",       label: "Any time" },
  { id: "morning",   label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "evening",   label: "Evening" },
];

const TYPE_OPTIONS: { id: EventType; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "public",  label: "Public" },
  { id: "private", label: "Private" },
];

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

// ─── Recurring series helpers ─────────────────────────────────────────────────

// High-confidence separators that split a series name from a guest/edition.
// Multi-word separators are checked before single-word ones to avoid false splits.
const SERIES_SEPARATORS = [
  " w/ ",
  " avec ",
  " with ",
  " feat. ",
  " ft. ",
  " featuring ",
  " présente ",
  " presents ",
];

// Returns { series, edition } — edition is null when no known separator is found.
function splitSeriesTitle(title: string): { series: string; edition: string | null } {
  const lower = title.toLowerCase();
  for (const sep of SERIES_SEPARATORS) {
    const idx = lower.indexOf(sep);
    if (idx > 0) {
      const series = title.slice(0, idx).trim();
      const edition = title.slice(idx + sep.length).trim() || null;
      return { series, edition };
    }
  }
  return { series: title, edition: null };
}

// Returns a Set of event IDs that belong to a recognisable recurring series.
// Criteria: same normalised series-title prefix + same venue name, 2+ occurrences.
function buildRecurringSet(events: EventRow[]): Set<string> {
  const groups: Record<string, string[]> = {};
  for (const e of events) {
    const { series } = splitSeriesTitle(e.title);
    // Key = normalised series title + venue anchor (venue name if known, else event id as fallback).
    const venueAnchor = e.venues?.name ? normalizeStr(e.venues.name) : `id:${e.id}`;
    const key = normalizeStr(series) + "|" + venueAnchor;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e.id);
  }
  const recurring = new Set<string>();
  for (const ids of Object.values(groups)) {
    if (ids.length >= 2) ids.forEach((id) => recurring.add(id));
  }
  return recurring;
}

// ─── Supabase query builder ───────────────────────────────────────────────────

function buildPageQuery(
  supabase: ReturnType<typeof supabaseBrowser>,
  pageIndex: number,
  searchQuery: string
) {
  const rangeFrom = pageIndex * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  let q = supabase
    .from("events")
    .select(
      "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url,venues(name,city)"
    )
    .eq("city_normalized", "montreal")
    .in("status", ["scheduled", "announced"])
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("visibility", "public")
    .gte("start_at", new Date().toISOString());

  if (searchQuery) {
    const escaped = escapeIlike(searchQuery.trim());
    q = q.or(`title.ilike.%${escaped}%,title_normalized.ilike.%${escaped}%`);
  }

  return q.order("start_at", { ascending: true }).range(rangeFrom, rangeTo);
}

// Full-pool query used when any explicit filter is active.
// Fetches up to 1000 events (same ceiling as /map) so date/time/type filtering
// works correctly without the user needing to paginate through the default feed.
function buildFullQuery(
  supabase: ReturnType<typeof supabaseBrowser>,
  searchQuery: string,
) {
  let q = supabase
    .from("events")
    .select(
      "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url,venues(name,city)"
    )
    .eq("city_normalized", "montreal")
    .in("status", ["scheduled", "announced"])
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("visibility", "public")
    .gte("start_at", new Date().toISOString());

  if (searchQuery) {
    const escaped = escapeIlike(searchQuery.trim());
    q = q.or(`title.ilike.%${escaped}%,title_normalized.ilike.%${escaped}%`);
  }

  return q.order("start_at", { ascending: true }).limit(1000);
}

// ─── Client-side filter helpers ───────────────────────────────────────────────

function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const toDateKey = (date: Date) =>
    date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  const eventDay = toDateKey(d);
  const today = toDateKey(now);
  const tomorrow = toDateKey(new Date(now.getTime() + 86_400_000));

  const rawTime = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  // "8:00 PM" → "8pm", "8:30 PM" → "8:30pm"
  const timeStr = rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();

  if (eventDay === today) return `Today at ${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow at ${timeStr}`;

  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    const weekday = d.toLocaleDateString("en-US", {
      timeZone: "America/Toronto",
      weekday: "long",
    });
    return `${weekday} at ${timeStr}`;
  }

  const monthDay = d.toLocaleDateString("en-US", {
    timeZone: "America/Toronto",
    month: "short",
    day: "numeric",
  });
  return `${monthDay} at ${timeStr}`;
}

// Matches /map isInDateWindow exactly — timezone-aware, supports pick_date ranges.
function isInDateWindow(
  iso: string,
  window: DateFilter,
  pickedDate?: string,
  pickedDateEnd?: string,
): boolean {
  if (window === "all") return true;
  const now = new Date();
  const d   = new Date(iso);
  const tz  = "America/Toronto";
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
  const eventStr = d.toLocaleDateString("en-CA",   { timeZone: tz });

  if (window === "pick_date") {
    if (!pickedDate) return true;
    if (pickedDateEnd && pickedDateEnd !== pickedDate) {
      const start = new Date(pickedDate    + "T00:00:00");
      const end   = new Date(pickedDateEnd + "T23:59:59");
      return d >= start && d <= end;
    }
    return eventStr === pickedDate;
  }

  if (window === "today") return eventStr === todayStr;

  if (window === "this_week") {
    const day = now.getDay();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return d >= weekStart && d < weekEnd;
  }

  if (window === "weekend") {
    const nowDay = now.getDay();
    const satOffset = nowDay === 0 ? -1 : 6 - nowDay;
    const thisSat = new Date(now);
    thisSat.setDate(now.getDate() + satOffset);
    thisSat.setHours(0, 0, 0, 0);
    const nextMon = new Date(thisSat);
    nextMon.setDate(thisSat.getDate() + 2);
    return d >= thisSat && d < nextMon;
  }

  return true;
}


// ─── Component ────────────────────────────────────────────────────────────────

type TileRsvpData = {
  counts: Record<string, number>;
  names: Record<string, string[]>;
  avatars: Record<string, (string | null)[]>;
};

const EMPTY_RSVP: TileRsvpData = { counts: {}, names: {}, avatars: {} };

async function fetchTileRsvpData(ids: string[]): Promise<TileRsvpData> {
  if (ids.length === 0) return EMPTY_RSVP;
  const { data } = await supabaseBrowser()
    .from("rsvps")
    .select("event_id,profiles(display_name,avatar_url)")
    .in("event_id", ids)
    .in("response", ["going", "maybe"])
    .limit(500);

  const counts: Record<string, number> = {};
  const names: Record<string, string[]> = {};
  const avatars: Record<string, (string | null)[]> = {};

  for (const row of (data ?? []) as {
    event_id: string;
    profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null;
  }[]) {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const name = p?.display_name;
    if (name) {
      if (!names[row.event_id]) { names[row.event_id] = []; avatars[row.event_id] = []; }
      if (names[row.event_id].length < 2) {
        names[row.event_id].push(name.split(" ")[0]);
        avatars[row.event_id].push(p?.avatar_url ?? null);
      }
    }
  }

  return { counts, names, avatars };
}


// Returns ISO bounds for "today through end of this week (Sunday)" in Montréal time.
// start = today midnight, end = next-Monday midnight (exclusive).
// Pure computation — called once in useState initializer, no impurity in render.
function thisWeekBoundsIso(): { start: string; end: string } {
  const now = new Date();
  const montrealDateStr = now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const dayName = now.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "short" });
  const offsets: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysFromMonday = offsets[dayName] ?? 0;
  const [y, m, d] = montrealDateStr.split("-").map(Number);
  // start = today midnight (skip earlier days of the week that have passed)
  const start = montrealDayStart(montrealDateStr);
  // end = next Monday midnight (= Sunday 23:59:59 + 1s, exclusive upper bound)
  const nextMondayStr = new Date(Date.UTC(y, m - 1, d - daysFromMonday + 7)).toISOString().slice(0, 10);
  return { start, end: montrealDayStart(nextMondayStr) };
}

const CATEGORY_LABELS: Record<string, string> = {
  all:          "All",
  concerts:     "Concerts",
  nightlife:    "Nightlife",
  arts_culture: "Arts & Culture",
  comedy:       "Comedy",
  sports:       "Sports",
  family:       "Family",
};


function categoryBg(cat: Category): string {
  switch (cat) {
    case "concerts":     return "#0D1520";
    case "nightlife":    return "#0A1018";
    case "arts_culture": return "#0E1319";
    case "comedy":       return "#0F1318";
    case "sports":       return "#0A1216";
    case "family":       return "#0C1220";
    default:             return "#0B0F14";
  }
}

const AVATAR_COLORS = [
  "#3B82F6", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// Identical to the MiniCalendar in /map — tap-tap range selection.
function MiniCalendar({
  start,
  end,
  onDayTap,
}: {
  start: string;
  end: string;
  onDayTap: (iso: string) => void;
}) {
  const [year, setYear] = useState(() => {
    const d = start ? new Date(start + "T00:00:00") : new Date();
    return d.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const d = start ? new Date(start + "T00:00:00") : new Date();
    return d.getMonth();
  });

  const todayIso = new Date().toLocaleDateString("en-CA");
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null) as null[],
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }),
  ];

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }

  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button type="button" onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.55, padding: "0 8px", lineHeight: 1 }}>‹</button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{monthLabel}</span>
        <button type="button" onClick={nextMonth} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.55, padding: "0 8px", lineHeight: 1 }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, opacity: 0.4, padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e-${i}`} />;
          const isStart    = iso === start;
          const isEnd      = iso === end;
          const isSelected = isStart || isEnd;
          const inRange    = !!(start && end && start !== end && iso > start && iso < end);
          const isToday    = iso === todayIso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayTap(iso)}
              style={{
                textAlign: "center", padding: "6px 2px", border: "none", cursor: "pointer",
                borderRadius: 6, fontSize: 13,
                fontWeight: isSelected ? 700 : 400,
                background: isSelected ? "#3B82F6" : inRange ? "rgba(59,130,246,0.14)" : "transparent",
                color: isSelected ? "#fff" : isToday ? "#5EA8FF" : "inherit",
                outline: isToday && !isSelected ? "1.5px solid #5EA8FF" : "none",
                outlineOffset: -1,
              }}
            >
              {new Date(iso + "T00:00:00").getDate()}
            </button>
          );
        })}
      </div>
      {start && !end && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8, textAlign: "center" }}>
          Tap a second date to set a range
        </div>
      )}
    </div>
  );
}

// ── Skeleton loading placeholders ────────────────────────────────────────────
// Displayed only on initial load (no cached events yet).
// Mirrors the shape of "This week" cards + "All events" grid so the layout
// doesn't collapse and the shell stays visually stable.

function SkeletonCard({ aspectRatio = "65%" }: { aspectRatio?: string }) {
  return (
    <div
      className="skeleton"
      style={{
        borderRadius: 20,
        background: "rgba(18,26,36,0.70)",
        paddingBottom: aspectRatio,
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}

function SkeletonResults() {
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* "This week" row */}
      <div style={{ display: "grid", gap: 10 }}>
        <div className="skeleton" style={{ height: 20, width: 90, borderRadius: 6, background: "rgba(18,26,36,0.80)" }} />
        <div style={{ display: "flex", gap: 12, overflow: "hidden" }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                flexShrink: 0,
                width: "min(82vw, 320px)",
                height: 240,
                borderRadius: 28,
                background: "rgba(18,26,36,0.70)",
              }}
            />
          ))}
        </div>
      </div>
      {/* "All events" grid */}
      <div style={{ display: "grid", gap: 10 }}>
        <div className="skeleton" style={{ height: 20, width: 90, borderRadius: 6, background: "rgba(18,26,36,0.80)" }} />
        <div
          className="events-grid"
          style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
        >
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );
}

export function EventsList() {
  const { user, session } = useAuth();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tileRsvp, setTileRsvp] = useState<TileRsvpData>(EMPTY_RSVP);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [starPending, setStarPending] = useState<Set<string>>(new Set());

  // Typed query (immediate, controls the input).
  const [query, setQuery] = useState("");
  // Debounced version sent to Supabase.
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [category, setCategory] = useState<Category | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [pickedDate, setPickedDate] = useState("");
  const [pickedDateEnd, setPickedDateEnd] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<EventType>("all");

  // Small pool of event titles used to compute "did you mean?" suggestions.
  const [suggestionPool, setSuggestionPool] = useState<SuggestionItem[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterClosing, setFilterClosing] = useState(false);
  const [thisWeekOpen, setThisWeekOpen] = useState(false);

  // Draft state — lives only while the filter sheet is open.
  // Chips edit draft; X discards; ✓ commits to real filter state.
  const [draftDateFilter, setDraftDateFilter] = useState<DateFilter>("all");
  const [draftPickedDate, setDraftPickedDate] = useState("");
  const [draftPickedDateEnd, setDraftPickedDateEnd] = useState("");
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilter>("all");
  const [draftTypeFilter, setDraftTypeFilter] = useState<EventType>("all");

  const { hide: hideNav, show: showNav } = useBottomNav();
  useEffect(() => {
    if (filtersOpen || filterClosing) { hideNav(); } else { showNav(); }
    return () => { showNav(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersOpen, filterClosing]);
  const [weekBounds] = useState(() => thisWeekBoundsIso());

  // Full event pool fetched when any explicit filter is active.
  // Avoids the paginated feed's inability to surface future-date events up front.
  const [filteredPool, setFilteredPool] = useState<EventRow[]>([]);
  const [filteredPoolLoading, setFilteredPoolLoading] = useState(false);

  const activeFilterCount = [
    dateFilter !== "all",
    timeFilter !== "all",
    typeFilter !== "all",
  ].filter(Boolean).length;

  // Filtered mode: any non-default filter OR non-"all" category is active.
  const isFiltered = activeFilterCount > 0 || category !== "all";

  function openFilter() {
    // Seed draft from current committed state so chips reflect what is applied.
    setDraftDateFilter(dateFilter);
    setDraftPickedDate(pickedDate);
    setDraftPickedDateEnd(pickedDateEnd);
    setDraftTimeFilter(timeFilter);
    setDraftTypeFilter(typeFilter);
    setFilterClosing(false);
    setFiltersOpen(true);
  }

  function closeFilter() {
    setFilterClosing(true);
    setTimeout(() => {
      setFiltersOpen(false);
      setFilterClosing(false);
    }, 250);
  }

  function confirmFilters() {
    setDateFilter(draftDateFilter);
    setPickedDate(draftPickedDate);
    setPickedDateEnd(draftPickedDateEnd);
    setTimeFilter(draftTimeFilter);
    setTypeFilter(draftTypeFilter);
    closeFilter();
  }

  function clearDraftFilters() {
    setDraftDateFilter("all");
    setDraftPickedDate("");
    setDraftPickedDateEnd("");
    setDraftTimeFilter("all");
    setDraftTypeFilter("all");
  }

  function handleDraftDateTap(iso: string) {
    if (draftPickedDate === "" || draftPickedDateEnd !== "") {
      setDraftPickedDate(iso);
      setDraftPickedDateEnd("");
      setDraftDateFilter("pick_date");
    } else {
      if (iso === draftPickedDate) setDraftPickedDateEnd(iso);
      else if (iso < draftPickedDate) setDraftPickedDate(iso);
      else setDraftPickedDateEnd(iso);
    }
  }

  const genRef = useRef(0);
  const filteredGenRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
        .in("status", ["scheduled", "announced"])
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

  // Fetch the full event pool whenever filtered mode is active.
  // Runs when category/date/time/type filters or search change while a filter is on.
  useEffect(() => {
    const active = category !== "all" || dateFilter !== "all" || timeFilter !== "all" || typeFilter !== "all";
    if (!active) {
      setFilteredPool([]);
      setFilteredPoolLoading(false);
      return;
    }
    const gen = ++filteredGenRef.current;
    setFilteredPoolLoading(true);
    buildFullQuery(supabaseBrowser(), debouncedQuery)
      .then(({ data }) => {
        if (gen !== filteredGenRef.current) return;
        const rows = (data ?? []) as unknown as EventRow[];
        setFilteredPool(rows);
        setFilteredPoolLoading(false);
        fetchTileRsvpData(rows.map((r) => r.id)).then((rsvp) =>
          setTileRsvp((prev) => ({
            counts: { ...prev.counts, ...rsvp.counts },
            names:  { ...prev.names,  ...rsvp.names  },
            avatars:{ ...prev.avatars, ...rsvp.avatars },
          }))
        );
      });
  }, [category, dateFilter, timeFilter, typeFilter, debouncedQuery]);

  // Load the current user's "maybe" RSVPs to initialise starred state.
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

  async function handleStar(eventId: string, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!session?.access_token) {
      window.dispatchEvent(new CustomEvent("outsy:open-signin"));
      return;
    }
    if (starPending.has(eventId)) return;
    const wasStarred = starredIds.has(eventId);
    // Optimistic update
    setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.delete(eventId); } else { s.add(eventId); } return s; });
    setStarPending((prev) => new Set(prev).add(eventId));
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: wasStarred ? "DELETE" : "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        ...(wasStarred ? {} : { body: JSON.stringify({ response: "maybe" }) }),
      });
      if (!res.ok) {
        // Revert on failure
        setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
      }
    } catch {
      setStarredIds((prev) => { const s = new Set(prev); if (wasStarred) { s.add(eventId); } else { s.delete(eventId); } return s; });
    } finally {
      setStarPending((prev) => { const s = new Set(prev); s.delete(eventId); return s; });
    }
  }

  // Reset + fetch page 0 whenever server-side filters change.
  useEffect(() => {
    const gen = ++genRef.current;

    const run = async () => {
      setLoading(true);
      setFetchError(null);
      setExhausted(false);
      setNextPage(1);

      const { data, error } = await buildPageQuery(
        supabaseBrowser(),
        0,
        debouncedQuery
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
  }, [debouncedQuery]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { data, error } = await buildPageQuery(
      supabaseBrowser(),
      nextPage,
      debouncedQuery
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
        avatars: { ...prev.avatars, ...next.avatars },
      }))
    );
  }

  // Text search is server-side; category/date/time/type are client-side.
  // In filtered mode, operate on the full pool so future dates are always reachable.
  const filtered = useMemo(() => {
    const source = isFiltered ? filteredPool : events;
    return source.filter((e) => {
      if (category !== "all" && e.category_primary !== category) return false;
      if (!isInDateWindow(e.start_at, dateFilter, pickedDate, pickedDateEnd)) return false;
      if (timeFilter !== "all") {
        const hour = new Date(e.start_at).getHours();
        if (timeFilter === "morning"   && !(hour >= 6  && hour < 12)) return false;
        if (timeFilter === "afternoon" && !(hour >= 12 && hour < 18)) return false;
        if (timeFilter === "evening"   && !(hour >= 18)) return false;
      }
      if (typeFilter === "public" && e.source === "manual") return false;
      if (typeFilter === "private" && e.source !== "manual") return false;
      return true;
    });
  }, [isFiltered, filteredPool, events, category, dateFilter, pickedDate, pickedDateEnd, timeFilter, typeFilter]);

  // Count of events matching draft filters — shown live in the filter sheet header.
  const draftFilteredCount = useMemo(() => {
    const source = isFiltered ? filteredPool : events;
    return source.filter((e) => {
      if (category !== "all" && e.category_primary !== category) return false;
      if (!isInDateWindow(e.start_at, draftDateFilter, draftPickedDate, draftPickedDateEnd)) return false;
      if (draftTimeFilter !== "all") {
        const hour = new Date(e.start_at).getHours();
        if (draftTimeFilter === "morning"   && !(hour >= 6  && hour < 12)) return false;
        if (draftTimeFilter === "afternoon" && !(hour >= 12 && hour < 18)) return false;
        if (draftTimeFilter === "evening"   && !(hour >= 18)) return false;
      }
      if (draftTypeFilter === "public"  && e.source === "manual") return false;
      if (draftTypeFilter === "private" && e.source !== "manual") return false;
      return true;
    }).length;
  }, [isFiltered, filteredPool, events, category, draftDateFilter, draftPickedDate, draftPickedDateEnd, draftTimeFilter, draftTypeFilter]);

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

  // Full set of this week's events — used for exclusion from "All events".
  // Must NOT be sliced so that events 21+ of the week don't leak into "All events".
  const thisWeekAll = useMemo<EventRow[]>(() => {
    if (debouncedQuery.trim()) return [];
    return filtered.filter((e) => e.start_at >= weekBounds.start && e.start_at < weekBounds.end);
  }, [filtered, debouncedQuery, weekBounds]);

  // Subset rendered in the horizontal scroll row (capped for performance).
  const thisWeekEvents = useMemo(() => thisWeekAll.slice(0, 20), [thisWeekAll]);

  const thisWeekAllIds = useMemo(() => new Set(thisWeekAll.map((e) => e.id)), [thisWeekAll]);

  // "All events" excludes the FULL weekly set, not just the rendered slice.
  const allEventsFiltered = useMemo(
    () => filtered.filter((e) => !thisWeekAllIds.has(e.id)),
    [filtered, thisWeekAllIds]
  );

  // Detect recurring series across all visible events (this week + all events).
  // Any series/venue pair with ≥2 occurrences is flagged so cards can show a
  // recurring indicator instead of looking like accidental duplicates.
  const recurringSet = useMemo(
    () => buildRecurringSet([...thisWeekAll, ...allEventsFiltered]),
    [thisWeekAll, allEventsFiltered]
  );

  return (
    <div style={{ display: "grid", gap: 16, minWidth: 0, alignContent: "start" }}>
      {/* ── Stable shell: always visible regardless of loading/empty state ── */}
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
      {/* Search + Filters */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {/* Search bar — solid dark surface */}
        <div style={{
          position: "relative",
          flex: 1,
          display: "flex",
          alignItems: "center",
          background: "#121821",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 999,
          padding: "0 10px 0 14px",
          gap: 8,
          minWidth: 0,
        }}>
          {/* Search icon — low contrast */}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, venues, artists..."
            className="search-input"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              padding: "9px 0",
              fontSize: 16,
              color: "#F5F7FA",
              minWidth: 0,
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery("");
                inputRef.current?.focus();
              }}
              style={{
                width: 22, height: 22, borderRadius: "50%",
                border: "none", background: "rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "rgba(255,255,255,0.35)", flexShrink: 0,
              }}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        {/* Filter button — matches search height and surface */}
        <button
          type="button"
          onClick={() => openFilter()}
          aria-label="Filters"
          style={{
            width: 40, height: 40, borderRadius: "50%",
            border: `1px solid ${activeFilterCount > 0 ? "rgba(94,168,255,0.25)" : "rgba(255,255,255,0.06)"}`,
            background: activeFilterCount > 0 ? "rgba(94,168,255,0.10)" : "#121821",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, position: "relative",
            color: activeFilterCount > 0 ? "#5EA8FF" : "rgba(255,255,255,0.30)",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2.3" fill="#121821" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="12" r="2.3" fill="#121821" stroke="currentColor" strokeWidth="2" />
            <circle cx="11" cy="18" r="2.3" fill="#121821" stroke="currentColor" strokeWidth="2" />
          </svg>
          {activeFilterCount > 0 && (
            <span style={{ position: "absolute", top: 3, right: 3, width: 6, height: 6, borderRadius: "50%", background: "#5EA8FF", border: "1.5px solid #0B0F14" }} />
          )}
        </button>
      </div>

      {/* Category chip row — liquid glass */}
      <div className="chip-row" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2, minWidth: 0 }}>
        {(["all", "concerts", "nightlife", "arts_culture", "comedy", "sports", "family"] as const).map((c) => {
          const active = category === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              style={{
                padding: "8px 18px",
                borderRadius: 999,
                border: `1px solid ${active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.09)"}`,
                background: active
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(255,255,255,0.06)",
                backdropFilter: "blur(20px) saturate(1.6)",
                WebkitBackdropFilter: "blur(20px) saturate(1.6)",
                color: active ? "#F5F7FA" : "rgba(255,255,255,0.55)",
                fontWeight: active ? 600 : 400,
                fontSize: 13,
                letterSpacing: "-0.01em",
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "background 0.18s ease, border-color 0.18s ease, color 0.18s ease, box-shadow 0.18s ease",
                boxShadow: active
                  ? "inset 0 1.5px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.12), 0 2px 12px rgba(0,0,0,0.28)"
                  : "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.08), 0 1px 6px rgba(0,0,0,0.18)",
              }}
            >
              {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>
      </div>{/* end stable shell */}

      {/* ── Results area: only this section changes on load / empty state ── */}
      <div style={{ minWidth: 0 }}>
      {fetchError ? (
        <p style={{ color: "#dc2626" }}>Could not load events: {fetchError}</p>
      ) : (isFiltered ? (filteredPoolLoading && filteredPool.length === 0) : (loading && events.length === 0)) ? (
        <SkeletonResults />
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
        isFiltered ? (
          <div style={{ paddingTop: 16, display: "grid", gap: 12 }}>
            <p style={{ fontSize: 15, opacity: 0.55 }}>No events match your filters.</p>
          </div>
        ) : (
          <p>No events found.</p>
        )
      ) : isFiltered ? (
        /* ── Filtered results: flat grid, no discovery sections ─────────── */
        <section style={{ display: "grid", gap: 12, opacity: filteredPoolLoading && filteredPool.length > 0 ? 0.45 : 1, transition: "opacity 150ms ease" }}>
          <div className="events-grid" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {filtered.map((e) => {
              const rsvpCount = tileRsvp.counts[e.id] ?? 0;
              const rsvpNames = tileRsvp.names[e.id] ?? [];
              const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
              const starred = starredIds.has(e.id);
              const pending = starPending.has(e.id);
              const { series: eSeriesTitle, edition: eEdition } = splitSeriesTitle(e.title);
              const isRecurring = recurringSet.has(e.id);
              return (
                <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", display: "block", minWidth: 0 }}>
                  <article style={{ borderRadius: 20, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                    <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                      {e.image_url && (
                        <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.50) 40%, rgba(0,0,0,0.08) 70%, transparent 100%)" }} />
                      <button
                        type="button"
                        aria-label={starred ? "Remove from saved" : "Save event"}
                        onClick={(ev) => handleStar(e.id, ev)}
                        style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", border: "none", background: starred ? "rgba(94, 168, 255, 0.80)" : "rgba(11, 15, 20, 0.52)", display: "flex", alignItems: "center", justifyContent: "center", cursor: pending ? "wait" : "pointer", color: starred ? "#fff" : "rgba(255,255,255,0.85)", opacity: pending ? 0.6 : 1 }}
                      >
                        <HeartIcon filled={starred} />
                      </button>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 11, color: "rgba(199,208,219,0.9)", fontWeight: 500, letterSpacing: "0.01em" }}>{smartDate(e.start_at)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#F5F7FA", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                        {eEdition && <div style={{ fontSize: 11, color: "rgba(199,208,219,0.75)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>}
                        {e.venues?.name && (
                          <div style={{ fontSize: 11, color: "rgba(140,152,168,0.90)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {isRecurring ? "↻ " : ""}{e.venues.city ? `${e.venues.name}, ${e.venues.city}` : e.venues.name}
                          </div>
                        )}
                      </div>
                      {rsvpCount > 0 && (rsvpAvatars[0] || rsvpNames[0]) && (
                        <div style={{ position: "absolute", bottom: 10, right: 10, width: 20, height: 20 }}>
                          {rsvpAvatars[0] ? (
                            <img src={rsvpAvatars[0]} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(0,0,0,0.4)", display: "block" }} />
                          ) : (
                            <div style={{ width: 20, height: 20, borderRadius: "50%", background: getAvatarColor(rsvpNames[0]!), border: "2px solid rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>
                              {rsvpNames[0]![0].toUpperCase()}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <div style={{ display: "grid", gap: 16, opacity: loading && events.length > 0 ? 0.45 : 1, transition: "opacity 150ms ease" }}>
          {/* ── This week: horizontal scroll ─────────────────────────────── */}
          {thisWeekEvents.length > 0 && (
            <section style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: "-0.025em", color: "#F5F7FA" }}>This week</h2>
                <button
                  type="button"
                  onClick={() => setThisWeekOpen(true)}
                  style={{ fontSize: 13, color: "#8C98A8", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}
                >
                  See all
                </button>
              </div>
              <div className="events-week-scroll" style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", minWidth: 0, paddingRight: 12, paddingBottom: 4, scrollSnapType: "x mandatory" }}>
                {thisWeekEvents.map((e) => {
                  const starred = starredIds.has(e.id);
                  const pending = starPending.has(e.id);
                  const rsvpCount = tileRsvp.counts[e.id] ?? 0;
                  const rsvpNames = tileRsvp.names[e.id] ?? [];
                  const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
                  const isRecurring = recurringSet.has(e.id);
                  const venueLabel = e.venues?.name
                    ? `${isRecurring ? "↻ " : ""}${e.venues.city ? `${e.venues.name}, ${e.venues.city}` : e.venues.name}`
                    : null;
                  const infoLine = [smartDate(e.start_at), venueLabel].filter(Boolean).join(" · ");
                  return (
                    <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0, scrollSnapAlign: "start", display: "block" }}>
                      <div style={{ position: "relative", width: 255, height: 182, borderRadius: 15, overflow: "hidden", transform: "translateZ(0)", background: categoryBg(e.category_primary) }}>
                        {/* Background image */}
                        {e.image_url && (
                          <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                        {/* Top gradient: darkens top edge for avatar/button contrast */}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,28,28,0.6) 0%, rgba(28,28,28,0) 21%)", pointerEvents: "none" }} />
                        {/* Bottom gradient: fades to #1c1c1c for text legibility */}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,28,28,0.13) 69%, #1c1c1c 100%)", pointerEvents: "none" }} />

                        {/* Social avatars — top left */}
                        {rsvpCount > 0 && (
                          <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center" }}>
                            {[0, 1, 2].map((idx) => {
                              if (!rsvpAvatars[idx] && !rsvpNames[idx]) return null;
                              return rsvpAvatars[idx] ? (
                                <img key={idx} src={rsvpAvatars[idx]} alt="" style={{ width: 17, height: 17, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(0,0,0,0.5)", display: "block", marginLeft: idx > 0 ? -6 : 0 }} />
                              ) : (
                                <div key={idx} style={{ width: 17, height: 17, borderRadius: "50%", background: getAvatarColor(rsvpNames[idx]!), border: "1.5px solid rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff", marginLeft: idx > 0 ? -6 : 0 }}>
                                  {rsvpNames[idx]![0].toUpperCase()}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Interested button — top right */}
                        <button
                          type="button"
                          aria-label={starred ? "Remove from saved" : "Save event"}
                          onClick={(ev) => handleStar(e.id, ev)}
                          style={{
                            position: "absolute", top: 7, right: 8,
                            width: 26, height: 26, borderRadius: "50%", border: "none",
                            background: starred ? "rgba(94,168,255,0.85)" : "transparent",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: pending ? "wait" : "pointer",
                            opacity: pending ? 0.6 : 1,
                            padding: 0,
                          }}
                        >
                          <img src="/icons/IconInterested.svg" alt="" style={{ width: 15, height: 15, opacity: starred ? 1 : 0.85 }} />
                        </button>

                        {/* Title + info — centered at bottom */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 9px 11px", textAlign: "center", fontFamily: "var(--font-inter, Inter, sans-serif)" }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#F5F7FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, marginBottom: 3 }}>
                            {e.title}
                          </div>
                          <div style={{ fontSize: 10, fontWeight: 500, color: "#F5F7FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, opacity: 0.85 }}>
                            {infoLine}
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── All events ───────────────────────────────────────────────── */}
          <section style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, letterSpacing: "-0.025em", color: "#F5F7FA" }}>All events</h2>
              {(category !== "all" || dateFilter !== "all" || timeFilter !== "all" || typeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setCategory("all"); setDateFilter("all"); setPickedDate(""); setPickedDateEnd(""); setTimeFilter("all"); setTypeFilter("all"); }}
                  style={{ fontSize: 13, color: "#8C98A8", background: "none", border: "none", cursor: "pointer", fontWeight: 500, padding: 0 }}
                >
                  See all
                </button>
              )}
            </div>
            <div className="events-grid" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {allEventsFiltered.map((e) => {
                const rsvpCount = tileRsvp.counts[e.id] ?? 0;
                const rsvpNames = tileRsvp.names[e.id] ?? [];
                const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
                const starred = starredIds.has(e.id);
                const pending = starPending.has(e.id);
                const { series: eSeriesTitle, edition: eEdition } = splitSeriesTitle(e.title);
                const isRecurring = recurringSet.has(e.id);
                return (
                  <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", display: "block", minWidth: 0 }}>
                    <article style={{ borderRadius: 20, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                      <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                        {e.image_url && (
                          <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.50) 40%, rgba(0,0,0,0.08) 70%, transparent 100%)" }} />
                        {/* Star button */}
                        <button
                          type="button"
                          aria-label={starred ? "Remove from saved" : "Save event"}
                          onClick={(ev) => handleStar(e.id, ev)}
                          style={{
                            position: "absolute", top: 8, right: 8,
                            width: 32, height: 32, borderRadius: "50%", border: "none",
                            background: starred ? "rgba(94, 168, 255, 0.80)" : "rgba(11, 15, 20, 0.52)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: pending ? "wait" : "pointer",
                            color: starred ? "#fff" : "rgba(255,255,255,0.85)",
                            opacity: pending ? 0.6 : 1,
                          }}
                        >
                          <HeartIcon filled={starred} />
                        </button>
                        {/* Text overlay */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                          {/* 1. Date */}
                          <div style={{ fontSize: 11, color: "rgba(199,208,219,0.9)", fontWeight: 500, letterSpacing: "0.01em" }}>{smartDate(e.start_at)}</div>
                          {/* 2. Series title (or full title when no separator found) */}
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#F5F7FA", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                          {/* 2b. Edition / guest line — only when a separator was detected */}
                          {eEdition && (
                            <div style={{ fontSize: 11, color: "rgba(199,208,219,0.75)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>
                          )}
                          {/* 3. Venue — prefixed with ↻ when part of a recurring series */}
                          {e.venues?.name && (
                            <div style={{ fontSize: 11, color: "rgba(140,152,168,0.90)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {isRecurring ? "↻ " : ""}{e.venues.city ? `${e.venues.name}, ${e.venues.city}` : e.venues.name}
                            </div>
                          )}
                        </div>
                        {rsvpCount > 0 && (rsvpAvatars[0] || rsvpNames[0]) && (
                          <div style={{ position: "absolute", bottom: 10, right: 10, width: 20, height: 20 }}>
                            {rsvpAvatars[0] ? (
                              <img src={rsvpAvatars[0]} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(0,0,0,0.4)", display: "block" }} />
                            ) : (
                              <div style={{ width: 20, height: 20, borderRadius: "50%", background: getAvatarColor(rsvpNames[0]!), border: "2px solid rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>
                                {rsvpNames[0]![0].toUpperCase()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
      </div>{/* end results area */}

      {/* Load more — only in default (non-filtered) mode */}
      {!isFiltered && !loading && events.length > 0 && !showEmptySearchState && (
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
                padding: "11px 32px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.07)",
                background: "rgba(18,26,36,0.70)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                cursor: loadingMore ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 14,
                color: "#C7D0DB",
                opacity: loadingMore ? 0.5 : 1,
                transition: "opacity 0.15s ease",
              }}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}

      {/* ── This week sheet ──────────────────────────────────────────── */}
      {thisWeekOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setThisWeekOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
        >
          <div style={{ background: "#101722", width: "100%", maxHeight: "90dvh", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.06)", borderBottom: "none" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 20px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, position: "relative" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, letterSpacing: "-0.02em", color: "#F5F7FA" }}>This week</h2>
              <button
                type="button"
                onClick={() => setThisWeekOpen(false)}
                aria-label="Close"
                style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, opacity: 0.35, padding: 4, color: "#F5F7FA" }}
              >
                ×
              </button>
            </div>
            {/* Cards */}
            <div style={{ overflowY: "auto", padding: "16px 20px 24px", flex: 1 }}>
              <div className="events-grid" style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                {thisWeekAll.map((e) => {
                  const rsvpCount = tileRsvp.counts[e.id] ?? 0;
                  const rsvpNames = tileRsvp.names[e.id] ?? [];
                  const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
                  const starred = starredIds.has(e.id);
                  const pending = starPending.has(e.id);
                  const { series: eSeriesTitle, edition: eEdition } = splitSeriesTitle(e.title);
                  const isRecurring = recurringSet.has(e.id);
                  return (
                    <Link key={e.id} href={`/events/${e.id}`} onClick={() => setThisWeekOpen(false)} style={{ textDecoration: "none", color: "inherit", display: "block", minWidth: 0 }}>
                      <article style={{ borderRadius: 20, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                        <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                          {e.image_url && (
                            <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.50) 40%, rgba(0,0,0,0.08) 70%, transparent 100%)" }} />
                          <button
                            type="button"
                            aria-label={starred ? "Remove from saved" : "Save event"}
                            onClick={(ev) => handleStar(e.id, ev)}
                            style={{ position: "absolute", top: 10, right: 10, width: 32, height: 32, borderRadius: "50%", border: "none", background: starred ? "rgba(94, 168, 255, 0.80)" : "rgba(11, 15, 20, 0.52)", display: "flex", alignItems: "center", justifyContent: "center", cursor: pending ? "wait" : "pointer", color: starred ? "#fff" : "rgba(255,255,255,0.85)", opacity: pending ? 0.6 : 1 }}
                          >
                            <HeartIcon filled={starred} />
                          </button>
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "14px 14px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ fontSize: 11, color: "rgba(199,208,219,0.9)", fontWeight: 500, letterSpacing: "0.01em" }}>{smartDate(e.start_at)}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#F5F7FA", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                            {eEdition && (
                              <div style={{ fontSize: 11, color: "rgba(199,208,219,0.75)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>
                            )}
                            {e.venues?.name && (
                              <div style={{ fontSize: 11, color: "rgba(140,152,168,0.90)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {isRecurring ? "↻ " : ""}{e.venues.city ? `${e.venues.name}, ${e.venues.city}` : e.venues.name}
                              </div>
                            )}
                          </div>
                          {rsvpCount > 0 && (rsvpAvatars[0] || rsvpNames[0]) && (
                            <div style={{ position: "absolute", bottom: 10, right: 10, width: 20, height: 20 }}>
                              {rsvpAvatars[0] ? (
                                <img src={rsvpAvatars[0]} alt="" style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(0,0,0,0.4)", display: "block" }} />
                              ) : (
                                <div style={{ width: 20, height: 20, borderRadius: "50%", background: getAvatarColor(rsvpNames[0]!), border: "2px solid rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>
                                  {rsvpNames[0]![0].toUpperCase()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters bottom sheet — identical to /map filter sheet */}
      {(filtersOpen || filterClosing) && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeFilter()}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 300, display: "flex", alignItems: "flex-end",
          }}
        >
          <div
            className={filterClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderBottom: "none",
              width: "100%",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
              maxHeight: "85dvh",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.40)" }} />
            </div>

            {/* Header: X · title+count · ✓ */}
            <div
              style={{
                flexShrink: 0,
                padding: "12px 16px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "grid",
                gridTemplateColumns: "40px 1fr 40px",
                alignItems: "center",
              }}
            >
              {/* Close — discard draft */}
              <button
                type="button"
                onClick={closeFilter}
                aria-label="Close filters"
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  cursor: "pointer", color: "#F5F7FA",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
                </svg>
              </button>

              {/* Title + live count */}
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.2, color: "#FFFFFF" }}>Filters</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
                  {draftFilteredCount} event{draftFilteredCount !== 1 ? "s" : ""}
                </div>
              </div>

              {/* Confirm — commit draft */}
              <button
                type="button"
                onClick={confirmFilters}
                aria-label="Apply filters"
                style={{
                  width: 34, height: 34, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  cursor: "pointer", color: "#F5F7FA",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0, justifySelf: "end",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,8 6,12 13,3" />
                </svg>
              </button>
            </div>

            {/* Scrollable filter content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Date */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                  Date
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DATE_OPTIONS.map((opt) => {
                    const isPickDate = opt.id === "pick_date";
                    const isActive   = draftDateFilter === opt.id;
                    let label = opt.label;
                    if (isPickDate && draftPickedDate) {
                      const fmt = (iso: string) =>
                        new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      label = draftPickedDateEnd && draftPickedDateEnd !== draftPickedDate
                        ? `${fmt(draftPickedDate)} → ${fmt(draftPickedDateEnd)}`
                        : fmt(draftPickedDate);
                    }
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraftDateFilter(opt.id)}
                        style={{
                          padding: "7px 14px", borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {draftDateFilter === "pick_date" && (
                  <MiniCalendar
                    start={draftPickedDate}
                    end={draftPickedDateEnd}
                    onDayTap={handleDraftDateTap}
                  />
                )}
              </div>

              {/* Time */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                  Time
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TIME_OPTIONS.map((opt) => {
                    const isActive = draftTimeFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraftTimeFilter(opt.id)}
                        style={{
                          padding: "7px 14px", borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Type */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase" as const, marginBottom: 10 }}>
                  Type
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TYPE_OPTIONS.map((opt) => {
                    const isActive = draftTypeFilter === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDraftTypeFilter(opt.id)}
                        style={{
                          padding: "7px 14px", borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Clear — always shown, resets draft to defaults */}
              <div style={{ display: "flex", justifyContent: "center", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
                <button
                  type="button"
                  onClick={clearDraftFilters}
                  className="filter-clear-btn"
                  style={{
                    padding: "9px 28px",
                    borderRadius: 20,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.85)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

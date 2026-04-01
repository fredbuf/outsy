/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "../components/AuthProvider";

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
    case "concerts":     return "linear-gradient(150deg, #1a0533 0%, #2d1b69 100%)";
    case "nightlife":    return "linear-gradient(150deg, #09090f 0%, #1e0a3c 100%)";
    case "arts_culture": return "linear-gradient(150deg, #1c1917 0%, #431407 100%)";
    case "comedy":       return "linear-gradient(150deg, #1a1a00 0%, #3d3000 100%)";
    case "sports":       return "linear-gradient(150deg, #001a0d 0%, #00381a 100%)";
    case "family":       return "linear-gradient(150deg, #001233 0%, #00296b 100%)";
    default:             return "linear-gradient(150deg, #111827 0%, #1f2937 100%)";
  }
}

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];
function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
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
                background: isSelected ? "#7c3aed" : inRange ? "rgba(124,58,237,0.14)" : "transparent",
                color: isSelected ? "#fff" : isToday ? "#7c3aed" : "inherit",
                outline: isToday && !isSelected ? "1.5px solid #7c3aed" : "none",
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
  const [thisWeekOpen, setThisWeekOpen] = useState(false);
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

  function handleResetFilters() {
    setDateFilter("all");
    setPickedDate("");
    setPickedDateEnd("");
    setTimeFilter("all");
    setTypeFilter("all");
  }

  function handleDateTap(iso: string) {
    if (pickedDate === "" || pickedDateEnd !== "") {
      setPickedDate(iso);
      setPickedDateEnd("");
      setDateFilter("pick_date");
    } else {
      if (iso === pickedDate) setPickedDateEnd(iso);
      else if (iso < pickedDate) setPickedDate(iso);
      else setPickedDateEnd(iso);
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
      setEvents([]);
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
    <div style={{ display: "grid", gap: 16 }}>
      {/* Search + Filters button */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, venues, artists..."
            style={{
              width: "100%",
              padding: query ? "10px 36px 10px 12px" : "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              boxSizing: "border-box",
              fontSize: 16,
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input
                setQuery("");
                inputRef.current?.focus();
              }}
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: 36,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "inherit",
                opacity: 0.45,
                padding: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          aria-label="Filters"
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: `1.5px solid ${activeFilterCount > 0 ? "var(--foreground)" : "var(--border-strong)"}`,
            background: activeFilterCount > 0 ? "var(--btn-bg-active)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "inherit",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2.3" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
            <circle cx="16" cy="12" r="2.3" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
            <circle cx="11" cy="18" r="2.3" fill="var(--background)" stroke="currentColor" strokeWidth="2" />
          </svg>
          {activeFilterCount > 0 && (
            <span style={{ position: "absolute", top: 2, right: 2, width: 8, height: 8, borderRadius: "50%", background: "var(--foreground)", border: "2px solid var(--background)" }} />
          )}
        </button>
      </div>

      {/* Category chip row */}
      <div className="chip-row" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {(["all", "concerts", "nightlife", "arts_culture", "comedy", "sports", "family"] as const).map((c) => {
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
              {CATEGORY_LABELS[c]}
            </button>
          );
        })}
      </div>

      {fetchError ? (
        <p style={{ color: "#dc2626" }}>Could not load events: {fetchError}</p>
      ) : (isFiltered ? filteredPoolLoading : loading) ? (
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
        isFiltered ? (
          <div style={{ paddingTop: 16, display: "grid", gap: 12 }}>
            <p style={{ fontSize: 15, opacity: 0.55 }}>No events match your filters.</p>
          </div>
        ) : (
          <p>No events found.</p>
        )
      ) : isFiltered ? (
        /* ── Filtered results: flat grid, no discovery sections ─────────── */
        <section style={{ display: "grid", gap: 12 }}>
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
                  <article style={{ borderRadius: 14, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                    <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                      {e.image_url && (
                        <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
                      <button
                        type="button"
                        aria-label={starred ? "Remove from saved" : "Save event"}
                        onClick={(ev) => handleStar(e.id, ev)}
                        style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", border: "none", background: starred ? "rgba(245,158,11,0.75)" : "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center", cursor: pending ? "wait" : "pointer", color: starred ? "#fff" : "rgba(255,255,255,0.85)", opacity: pending ? 0.6 : 1 }}
                      >
                        <StarIcon filled={starred} />
                      </button>
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(e.start_at)}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                        {eEdition && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>}
                        {e.venues?.name && (
                          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        <>
          {/* ── This week: horizontal scroll ─────────────────────────────── */}
          {thisWeekEvents.length > 0 && (
            <section style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>This week</h2>
                <button
                  type="button"
                  onClick={() => setThisWeekOpen(true)}
                  style={{ fontSize: 13, opacity: 0.55, background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 500, padding: 0 }}
                >
                  See all ›
                </button>
              </div>
              <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollbarWidth: "none", minWidth: 0, paddingRight: 12, paddingBottom: 4, scrollSnapType: "x mandatory" }}>
                {thisWeekEvents.map((e) => {
                  const starred = starredIds.has(e.id);
                  const pending = starPending.has(e.id);
                  const rsvpCount = tileRsvp.counts[e.id] ?? 0;
                  const rsvpNames = tileRsvp.names[e.id] ?? [];
                  const rsvpAvatars = tileRsvp.avatars[e.id] ?? [];
                  const { series: eSeriesTitle, edition: eEdition } = splitSeriesTitle(e.title);
                  const isRecurring = recurringSet.has(e.id);
                  return (
                    <Link key={e.id} href={`/events/${e.id}`} style={{ textDecoration: "none", color: "inherit", flexShrink: 0, scrollSnapAlign: "start", display: "block" }}>
                      <div style={{ position: "relative", width: "min(82vw, 320px)", height: 230, borderRadius: 24, overflow: "hidden", transform: "translateZ(0)", background: categoryBg(e.category_primary) }}>
                        {e.image_url && (
                          <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 75%, transparent 100%)" }} />
                        <button
                          type="button"
                          aria-label={starred ? "Remove from saved" : "Save event"}
                          onClick={(ev) => handleStar(e.id, ev)}
                          style={{
                            position: "absolute", top: 8, right: 8,
                            width: 30, height: 30, borderRadius: "50%", border: "none",
                            background: starred ? "rgba(245,158,11,0.75)" : "rgba(0,0,0,0.42)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: pending ? "wait" : "pointer",
                            color: starred ? "#fff" : "rgba(255,255,255,0.8)",
                            opacity: pending ? 0.6 : 1,
                          }}
                        >
                          <StarIcon filled={starred} />
                        </button>
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "8px 10px 11px", display: "flex", flexDirection: "column", gap: 2 }}>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(e.start_at)}</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                          {eEdition && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>
                          )}
                          {e.venues?.name && (
                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── All events ───────────────────────────────────────────────── */}
          <section style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>All events</h2>
              {(category !== "all" || dateFilter !== "all" || timeFilter !== "all" || typeFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setCategory("all"); setDateFilter("all"); setPickedDate(""); setPickedDateEnd(""); setTimeFilter("all"); setTypeFilter("all"); }}
                  style={{ fontSize: 13, opacity: 0.55, background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 500, padding: 0 }}
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
                    <article style={{ borderRadius: 14, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                      <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                        {e.image_url && (
                          <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                        )}
                        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
                        {/* Star button */}
                        <button
                          type="button"
                          aria-label={starred ? "Remove from saved" : "Save event"}
                          onClick={(ev) => handleStar(e.id, ev)}
                          style={{
                            position: "absolute", top: 8, right: 8,
                            width: 32, height: 32, borderRadius: "50%", border: "none",
                            background: starred ? "rgba(245,158,11,0.75)" : "rgba(0,0,0,0.42)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: pending ? "wait" : "pointer",
                            color: starred ? "#fff" : "rgba(255,255,255,0.85)",
                            opacity: pending ? 0.6 : 1,
                          }}
                        >
                          <StarIcon filled={starred} />
                        </button>
                        {/* Text overlay */}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                          {/* 1. Date */}
                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(e.start_at)}</div>
                          {/* 2. Series title (or full title when no separator found) */}
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                          {/* 2b. Edition / guest line — only when a separator was detected */}
                          {eEdition && (
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>
                          )}
                          {/* 3. Venue — prefixed with ↻ when part of a recurring series */}
                          {e.venues?.name && (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
        </>
      )}

      {/* Load more — only in default (non-filtered) mode */}
      {!isFiltered && !loading && !showEmptySearchState && (
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

      {/* ── This week sheet ──────────────────────────────────────────── */}
      {thisWeekOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setThisWeekOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
        >
          <div style={{ background: "var(--background)", width: "100%", maxHeight: "90dvh", borderRadius: "16px 16px 0 0", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "14px 20px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0, position: "relative" }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>This week</h2>
              <button
                type="button"
                onClick={() => setThisWeekOpen(false)}
                aria-label="Close"
                style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1, opacity: 0.4, padding: 4, color: "inherit" }}
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
                      <article style={{ borderRadius: 14, overflow: "hidden", position: "relative", width: "100%", maxWidth: "100%" }}>
                        <div style={{ position: "relative", width: "100%", paddingBottom: "65%", background: categoryBg(e.category_primary) }}>
                          {e.image_url && (
                            <img src={e.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                          )}
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 40%, rgba(0,0,0,0.1) 70%, transparent 100%)" }} />
                          <button
                            type="button"
                            aria-label={starred ? "Remove from saved" : "Save event"}
                            onClick={(ev) => handleStar(e.id, ev)}
                            style={{ position: "absolute", top: 8, right: 8, width: 32, height: 32, borderRadius: "50%", border: "none", background: starred ? "rgba(245,158,11,0.75)" : "rgba(0,0,0,0.42)", display: "flex", alignItems: "center", justifyContent: "center", cursor: pending ? "wait" : "pointer", color: starred ? "#fff" : "rgba(255,255,255,0.85)", opacity: pending ? 0.6 : 1 }}
                          >
                            <StarIcon filled={starred} />
                          </button>
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>{smartDate(e.start_at)}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: eEdition ? 1 : 2, WebkitBoxOrient: "vertical" }}>{eSeriesTitle}</div>
                            {eEdition && (
                              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{eEdition}</div>
                            )}
                            {e.venues?.name && (
                              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

      {/* Filters bottom sheet — matches /map layout exactly */}
      {filtersOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setFiltersOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "flex-end" }}
        >
          <div style={{ background: "var(--background)", width: "100%", borderRadius: "20px 20px 0 0", display: "flex", flexDirection: "column", maxHeight: "85dvh" }}>

            {/* Fixed header: drag handle + title + X */}
            <div style={{ flexShrink: 0, padding: "12px 20px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Filters</span>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, opacity: 0.45, lineHeight: 1, padding: 4 }}
                >
                  ×
                </button>
              </div>
            </div>

            {/* Scrollable filter content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 20px", display: "flex", flexDirection: "column", gap: 24 }}>

              {/* Date */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Date</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DATE_OPTIONS.map((opt) => {
                    const isPickDate = opt.id === "pick_date";
                    const isActive   = dateFilter === opt.id;
                    let label = opt.label;
                    if (isPickDate && pickedDate) {
                      const fmt = (iso: string) =>
                        new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                      label = pickedDateEnd && pickedDateEnd !== pickedDate
                        ? `${fmt(pickedDate)} → ${fmt(pickedDateEnd)}`
                        : fmt(pickedDate);
                    }
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setDateFilter(opt.id)}
                        style={{
                          padding: "7px 14px", borderRadius: 20, border: "none",
                          background: isActive ? "#7c3aed" : "var(--surface-raised)",
                          color: isActive ? "#fff" : "inherit",
                          fontSize: 13, fontWeight: 600, cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {dateFilter === "pick_date" && (
                  <MiniCalendar
                    start={pickedDate}
                    end={pickedDateEnd}
                    onDayTap={handleDateTap}
                  />
                )}
              </div>

              {/* Time */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Time</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {TIME_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTimeFilter(opt.id)}
                      style={{
                        padding: "7px 14px", borderRadius: 20, border: "none",
                        background: timeFilter === opt.id ? "#7c3aed" : "var(--surface-raised)",
                        color: timeFilter === opt.id ? "#fff" : "inherit",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>Type</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {TYPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTypeFilter(opt.id)}
                      style={{
                        padding: "7px 14px", borderRadius: 20, border: "none",
                        background: typeFilter === opt.id ? "#7c3aed" : "var(--surface-raised)",
                        color: typeFilter === opt.id ? "#fff" : "inherit",
                        fontSize: 13, fontWeight: 600, cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear filters — only shown when filters are active; matches /map style */}
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    padding: "10px",
                    borderRadius: 10,
                    border: "1px solid var(--border-strong)",
                    background: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 600,
                    opacity: 0.6,
                  }}
                >
                  Clear filters
                </button>
              )}

              {/* Bottom spacer so last item clears the sticky CTA */}
              <div style={{ height: 8 }} />
            </div>

            {/* Sticky CTA footer */}
            <div style={{ flexShrink: 0, padding: "12px 20px calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--border-strong)", background: "var(--background)" }}>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
                style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#7c3aed", color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.01em" }}
              >
                {loading ? "Loading…" : `Show ${filtered.length}${!exhausted ? "+" : ""} event${filtered.length !== 1 ? "s" : ""}`}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

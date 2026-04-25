/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useAuth } from "../components/AuthProvider";
import { BackButton } from "../events/[id]/BackButton";

const MONTREAL = { lat: 45.5017, lng: -73.5673 };
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// MAP_ID is intentionally NOT passed to the Map constructor.
//
// Google Maps has two renderers:
//   • Raster (no mapId): respects the `styles` array → custom map styling works.
//   • Vector (mapId present): ignores `styles` entirely → Cloud Console only.
//
// AdvancedMarkerElement (round photo markers) requires a mapId on the Map instance.
// That creates an irreconcilable conflict with the `styles` array.
//
// Current choice: raster renderer → custom styles apply → markers use styled
// circles (MARKER_DEFAULT / MARKER_SELECTED, Outsy blue #2563EB, white border).
//
// To restore photo markers AND keep custom styles, create a **Raster-type** Map ID
// in Google Cloud Console (Maps → Manage Map IDs → renderer = Raster), set
// NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID to that ID, then re-enable the mapId spread below
// and restore the AdvancedMarker conditionals.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";

// ── Custom map style ──────────────────────────────────────────────────────────
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  // ── Base text ────────────────────────────────────────────────────────────
  { featureType: "all",                    elementType: "labels.text.fill",   stylers: [{ color: "#c8d4e0" }] },
  { featureType: "all",                    elementType: "labels.text.stroke", stylers: [{ color: "#0b1520" }, { weight: 2 }] },

  // ── Administrative (keep neighborhood + city names, quiet borders) ───────
  { featureType: "administrative",         elementType: "geometry.stroke",    stylers: [{ color: "#1a3a4a" }, { weight: 1 }] },
  { featureType: "administrative.locality",elementType: "labels.text.fill",   stylers: [{ color: "#e2eaf2" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#7fa8c0" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.stroke", stylers: [{ weight: 1 }] },

  // ── Landscape ────────────────────────────────────────────────────────────
  { featureType: "landscape",              elementType: "all",                stylers: [{ color: "#08304b" }] },

  // ── POI: hide noisy categories ───────────────────────────────────────────
  // All POI labels off by default — only parks get a label below.
  { featureType: "poi",                    elementType: "geometry",           stylers: [{ color: "#0c3a4a" }] },
  { featureType: "poi",                    elementType: "labels",             stylers: [{ visibility: "off" }] },
  // Hide specific noisy POI types entirely
  { featureType: "poi.business",           elementType: "all",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical",            elementType: "all",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.school",             elementType: "all",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship",   elementType: "all",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.government",         elementType: "all",                stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex",     elementType: "all",                stylers: [{ visibility: "off" }] },
  // Parks: keep geometry + subtle label only
  { featureType: "poi.park",               elementType: "geometry",           stylers: [{ color: "#0d3d1e" }] },
  { featureType: "poi.park",               elementType: "labels.text.fill",   stylers: [{ visibility: "on" }, { color: "#3d8a55" }] },
  { featureType: "poi.park",               elementType: "labels.icon",        stylers: [{ visibility: "off" }] },
  // Keep attraction labels visible but muted
  { featureType: "poi.attraction",         elementType: "labels.text.fill",   stylers: [{ visibility: "on" }, { color: "#6b99b0" }] },
  { featureType: "poi.attraction",         elementType: "labels.icon",        stylers: [{ visibility: "off" }] },

  // ── Roads ────────────────────────────────────────────────────────────────
  { featureType: "road.highway",           elementType: "geometry.fill",      stylers: [{ color: "#0a1a24" }] },
  { featureType: "road.highway",           elementType: "geometry.stroke",    stylers: [{ color: "#0b434f" }, { lightness: 25 }] },
  { featureType: "road.highway",           elementType: "labels.text.fill",   stylers: [{ color: "#8ab0c0" }] },
  // Hide highway number shields (the green/blue route badges)
  { featureType: "road.highway",           elementType: "labels.icon",        stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial",          elementType: "geometry.fill",      stylers: [{ color: "#000000" }] },
  { featureType: "road.arterial",          elementType: "geometry.stroke",    stylers: [{ color: "#0b3d51" }, { lightness: 16 }] },
  { featureType: "road.arterial",          elementType: "labels.text.fill",   stylers: [{ color: "#6a90a0" }] },
  { featureType: "road.local",             elementType: "geometry",           stylers: [{ color: "#000000" }] },
  // Hide local road labels — too much clutter at city zoom
  { featureType: "road.local",             elementType: "labels",             stylers: [{ visibility: "off" }] },

  // ── Transit ──────────────────────────────────────────────────────────────
  { featureType: "transit",                elementType: "geometry",           stylers: [{ color: "#146474" }] },
  { featureType: "transit",                elementType: "labels.text.fill",   stylers: [{ color: "#5a8a96" }] },
  { featureType: "transit",                elementType: "labels.icon",        stylers: [{ visibility: "off" }] },

  // ── Water ────────────────────────────────────────────────────────────────
  { featureType: "water",                  elementType: "geometry",           stylers: [{ color: "#021019" }] },
  { featureType: "water",                  elementType: "labels.text.fill",   stylers: [{ color: "#3d6e7e" }] },
];

// ── Legacy circle icons (fallback when MAP_ID is not set) ─────────────────────
// path: 0 === google.maps.SymbolPath.CIRCLE (numeric value, safe at module level)
const MARKER_DEFAULT: google.maps.Symbol = {
  path: 0 as google.maps.SymbolPath,
  scale: 7,
  fillColor: "#2563EB",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
};

const MARKER_SELECTED: google.maps.Symbol = {
  path: 0 as google.maps.SymbolPath,
  scale: 11,
  fillColor: "#2563EB",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 3,
};

// ── Advanced marker helpers ────────────────────────────────────────────────────
// AdvancedMarkerElement requires a mapId on the Map instance.
// Wire NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID in .env.local to enable image markers.
// Without it, the code falls back to legacy google.maps.Marker (plain circles).

// Per-category fallback background used when an event has no image.
const CATEGORY_COLORS: Record<string, string> = {
  concerts:     "#4c1d95",
  nightlife:    "#1e1b4b",
  arts_culture: "#7c2d12",
  comedy:       "#713f12",
  sports:       "#14532d",
  family:       "#164e63",
};

function markerBg(category: string): string {
  return CATEGORY_COLORS[category] ?? "#4c1d95";
}

// Circular event image div used by AvatarMarker (OverlayView).
// translate(-50%,-50%) centering is applied by AvatarMarker.draw(), not here.
function createMarkerEl(imageUrl: string | null, selected: boolean, category = ""): HTMLElement {
  const size   = selected ? 52 : 40;
  const border = selected ? "3px solid #fff" : "2px solid rgba(255,255,255,0.90)";
  const shadow = selected
    ? "0 0 0 3px rgba(37,99,235,0.70), 0 4px 24px rgba(37,99,235,0.30), 0 4px 20px rgba(0,0,0,0.50)"
    : "0 2px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)";

  const el = document.createElement("div");
  el.style.cssText = [
    `width:${size}px`,
    `height:${size}px`,
    "border-radius:50%",
    "overflow:hidden",
    `border:${border}`,
    `box-shadow:${shadow}`,
    `background:${markerBg(category)}`,
    "cursor:pointer",
    "transition:width 0.15s ease,height 0.15s ease,box-shadow 0.15s ease,border 0.15s ease",
  ].join(";");

  if (imageUrl) {
    const img = document.createElement("img");
    img.src = imageUrl;
    img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;pointer-events:none;";
    el.appendChild(img);
  }

  return el;
}

function updateMarkerEl(el: HTMLElement, selected: boolean): void {
  el.style.width     = selected ? "52px" : "40px";
  el.style.height    = selected ? "52px" : "40px";
  el.style.border    = selected ? "3px solid #fff" : "2px solid rgba(255,255,255,0.90)";
  el.style.boxShadow = selected
    ? "0 0 0 3px rgba(37,99,235,0.70), 0 4px 24px rgba(37,99,235,0.30), 0 4px 20px rgba(0,0,0,0.50)"
    : "0 2px 10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.10)";
}

// ── Tile helpers (mirrors EventsList design) ──────────────────────────────────

function categoryBg(cat: string): string {
  switch (cat) {
    case "concerts":
    case "music":     return "#0D1520";
    case "nightlife": return "#0A1018";
    case "arts_culture":
    case "art":       return "#0E1319";
    case "comedy":    return "#0F1318";
    case "sports":    return "#0A1216";
    case "family":    return "#0C1220";
    default:          return "#0B0F14";
  }
}

function smartDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const toKey = (dt: Date) => dt.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  const eventDay = toKey(d);
  const today = toKey(now);
  const tomorrow = toKey(new Date(now.getTime() + 86_400_000));
  const rawTime = d.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true });
  const timeStr = rawTime.replace(/:00\s/, " ").replace(/\s/, "").toLowerCase();
  if (eventDay === today) return `Today at ${timeStr}`;
  if (eventDay === tomorrow) return `Tomorrow at ${timeStr}`;
  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    return `${d.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "long" })} at ${timeStr}`;
  }
  return `${d.toLocaleDateString("en-US", { timeZone: "America/Toronto", month: "short", day: "numeric" })} at ${timeStr}`;
}

type MapEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  source: string;
  category_primary: string;
  venues: { lat: number | null; lng: number | null; name: string | null; address_line1?: string | null } | null;
};

type TileAvatar = { url: string | null; name: string | null };

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── Filter types + constants ───────────────────────────────────────────────────

type MapCategory = "all" | "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
type DateFilter  = "all" | "today" | "this_week" | "weekend" | "pick_date";
type TypeFilter  = "all" | "public" | "private";
type TimeFilter  = "all" | "morning" | "afternoon" | "evening";

const MAP_CATEGORIES: { id: MapCategory; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "concerts",     label: "Concerts" },
  { id: "nightlife",    label: "Nightlife" },
  { id: "arts_culture", label: "Arts & Culture" },
  { id: "comedy",       label: "Comedy" },
  { id: "sports",       label: "Sports" },
  { id: "family",       label: "Family" },
];

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

const TYPE_OPTIONS: { id: TypeFilter; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "public",  label: "Public" },
  { id: "private", label: "Private" },
];

function isInDateWindow(iso: string, window: DateFilter, pickedDate?: string, pickedDateEnd?: string): boolean {
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
    const day = now.getDay(); // 0 = Sun
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    return d >= weekStart && d < weekEnd;
  }

  if (window === "weekend") {
    const nowDay = now.getDay();
    // Offset to the most-recent (or current) Saturday
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

// ── Category normalization ─────────────────────────────────────────────────────
// A small number of legacy DB rows have "music" or "art" instead of the
// canonical values. Normalise client-side so chip filtering is consistent.
const CATEGORY_ALIAS: Record<string, MapCategory> = {
  music: "concerts",
  art:   "arts_culture",
};

function normalizeCategory(raw: string): MapCategory {
  const known: MapCategory[] = ["concerts", "nightlife", "arts_culture", "comedy", "sports", "family"];
  if (known.includes(raw as MapCategory)) return raw as MapCategory;
  return CATEGORY_ALIAS[raw] ?? "concerts";
}

// ── Search suggestion helpers ──────────────────────────────────────────────────

function normalizeStr(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

function wordOverlapScore(query: string, candidate: string): number {
  const qNorm = normalizeStr(query);
  const tNorm = normalizeStr(candidate);
  const qWords = qNorm.split(/\s+/).filter((w) => w.length >= 3);
  if (qWords.length === 0) return 0;
  const tWordSet = new Set(tNorm.split(/\s+/).filter(Boolean));
  let score = 0;
  for (const w of qWords) {
    if (tWordSet.has(w)) score += 2;
    else if (tNorm.includes(w)) score += 1;
  }
  return score;
}


// ── Inline mini calendar for "Pick a date" ────────────────────────────────────
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
      {/* Month navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button
          type="button"
          onClick={prevMonth}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.9)", padding: "0 8px", lineHeight: 1 }}
        >
          ‹
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.9)", padding: "0 8px", lineHeight: 1 }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.9)", padding: "2px 0" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e-${i}`} />;

          const isStart    = iso === start;
          const isEnd      = iso === end;
          const isSelected = isStart || isEnd;
          const inRange    = !!(start && end && start !== end && iso > start && iso < end);
          const isToday    = iso === todayIso;
          const isPast     = iso < todayIso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayTap(iso)}
              style={{
                // Each cell is a fixed-height row; the circle is centered inside it
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "3px 0",
                border: "none",
                cursor: "pointer",
                background: inRange ? "rgba(37,99,235,0.18)" : "transparent",
                borderRadius: inRange ? 0 : 4,
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 400,
                  background: isSelected
                    ? "linear-gradient(135deg, #5EA8FF 0%, #3B82F6 100%)"
                    : "transparent",
                  color: isSelected
                    ? "#fff"
                    : isPast
                    ? "rgba(255,255,255,0.25)"
                    : "rgba(255,255,255,0.85)",
                  border: isToday && !isSelected
                    ? "1.5px solid rgba(94,168,255,0.55)"
                    : "none",
                  boxSizing: "border-box",
                  flexShrink: 0,
                }}
              >
                {new Date(iso + "T00:00:00").getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selection hint */}
      {start && !end && (
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 8, textAlign: "center" }}>
          Tap a second date to set a range
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  const { user, session } = useAuth();
  const router = useRouter();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  // AvatarMarker class is defined lazily inside initMap (google.maps.OverlayView
  // is only available after the Maps API script loads). Stored here for reuse.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const avatarMarkerClassRef = useRef<any>(null);
  const prevSelectedIdRef = useRef<string | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [deepLinkedEvent, setDeepLinkedEvent] = useState<MapEvent | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [selectedAvatars, setSelectedAvatars] = useState<TileAvatar[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [starPending, setStarPending] = useState<Set<string>>(new Set());
  const [starPressed, setStarPressed] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MapCategory>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [pickedDate, setPickedDate] = useState("");
  const [pickedDateEnd, setPickedDateEnd] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterClosing, setFilterClosing] = useState(false);
  // Draft state — lives only while the filter sheet is open.
  // Chips edit draft; X discards; ✓ commits to real filter state.
  const [draftDateFilter, setDraftDateFilter] = useState<DateFilter>("all");
  const [draftPickedDate, setDraftPickedDate] = useState("");
  const [draftPickedDateEnd, setDraftPickedDateEnd] = useState("");
  const [draftTimeFilter, setDraftTimeFilter] = useState<TimeFilter>("all");
  const [draftTypeFilter, setDraftTypeFilter] = useState<TypeFilter>("all");
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  // Tracks the last set of event IDs sent to the marker creation effect so we can
  // skip the full teardown/rebuild when the dataset hasn't actually changed.
  const prevMarkerKeyRef = useRef("");
  // Always-current ref to venueLeaderMap so the marker effect can read it
  // without needing it as a React dependency (they share the same filter deps
  // and change in lockstep, so the ref is always up to date when the effect runs).
  const venueLeaderMapRef = useRef<Map<string, MapEvent>>(new Map());

  // ── Deep-link state ────────────────────────────────────────────────────────
  // deepLinkCoordsRef  — lat/lng from the URL (server-baked, always available)
  // deepLinkAppliedRef — true only AFTER selected has been committed to the
  //                      deep-linked event; gates the exit-mode effect so it
  //                      can't fire in the same render cycle as auto-select.
  // isDeepLinkActiveRef — true from the moment eventId is found in the URL to
  //                       when the user exits focused mode. Set SYNCHRONOUSLY
  //                       before any async op so geolocation can't race it.
  const deepLinkCoordsRef = useRef<{ lat: number | null; lng: number | null }>({ lat: null, lng: null });
  const deepLinkAppliedRef = useRef(false);
  const isDeepLinkActiveRef = useRef(false);

  // Parse URL params on mount and kick off an authenticated event fetch.
  // We use the Next.js API route (service-role key) instead of supabaseBrowser()
  // so that private events work regardless of client-side session-restoration timing.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("eventId");
    if (eventId) {
      // Set isDeepLinkActiveRef SYNCHRONOUSLY — before any async op — so that
      // the geolocation callback (which fires ~1s later) sees it as true and
      // does not override the venue centering.
      isDeepLinkActiveRef.current = true;
      const rawLat = parseFloat(params.get("lat") ?? "");
      const rawLng = parseFloat(params.get("lng") ?? "");
      deepLinkCoordsRef.current = {
        lat: isNaN(rawLat) ? null : rawLat,
        lng: isNaN(rawLng) ? null : rawLng,
      };
      deepLinkAppliedRef.current = false;
      console.log("[map deep-link] params:", { eventId, lat: deepLinkCoordsRef.current.lat, lng: deepLinkCoordsRef.current.lng, isDeepLinkActive: isDeepLinkActiveRef.current });
      fetch(`/api/events/${eventId}`)
        .then((r) => r.json())
        .then((json: { ok: boolean; event?: MapEvent; error?: string }) => {
          if (json.ok && json.event) {
            console.log("[map deep-link] event fetched:", json.event.id, json.event.title);
            setDeepLinkedEvent(json.event);
          } else {
            console.warn("[map deep-link] fetch failed:", json.error);
          }
        })
        .catch((err) => console.error("[map deep-link] fetch error:", err));
    } else {
      const q = params.get("q");
      if (q) { setSearchQuery(q); setDebouncedSearchQuery(q); }
      // Restore filter state preserved in URL (e.g. returning via back button)
      const cat = params.get("cat") as MapCategory | null;
      if (cat && cat !== "all") setSelectedCategory(cat);
      const date = params.get("date") as DateFilter | null;
      if (date && date !== "all") setDateFilter(date);
      const dateFrom = params.get("dateFrom");
      if (dateFrom) setPickedDate(dateFrom);
      const dateTo = params.get("dateTo");
      if (dateTo) setPickedDateEnd(dateTo);
      const time = params.get("time") as TimeFilter | null;
      if (time && time !== "all") setTimeFilter(time);
      const type = params.get("type") as TypeFilter | null;
      if (type && type !== "all") setTypeFilter(type);
    }
  }, []);

  // Center the map as soon as it is ready using the URL-baked coordinates.
  // This is instant — does not wait for the event fetch.
  useEffect(() => {
    if (!mapsLoaded) return;
    const { lat, lng } = deepLinkCoordsRef.current;
    if (typeof lat === "number" && typeof lng === "number") {
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(15);
    }
  }, [mapsLoaded]);

  // Auto-select the deep-linked event once both the event data and the map are ready.
  // Guarded by deepLinkAppliedRef so it only fires once per deep-link session.
  useEffect(() => {
    if (!deepLinkedEvent || !mapsLoaded || deepLinkAppliedRef.current) return;
    const venueLat = deepLinkedEvent.venues?.lat;
    const venueLng = deepLinkedEvent.venues?.lng;
    const lat = venueLat ?? deepLinkCoordsRef.current.lat;
    const lng = venueLng ?? deepLinkCoordsRef.current.lng;
    console.log("[map deep-link] selecting event:", deepLinkedEvent.id, {
      venueLat, venueLng,
      urlLat: deepLinkCoordsRef.current.lat, urlLng: deepLinkCoordsRef.current.lng,
      finalLat: lat, finalLng: lng,
    });
    setSelected(deepLinkedEvent);
    if (typeof lat === "number" && typeof lng === "number") {
      console.log("[map deep-link] centering on venue (stored coords):", lat, lng);
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(15);
    } else {
      // No stored or URL coordinates — geocode from venue name + address.
      // This handles private events created before lat/lng storage was added.
      const venueName = deepLinkedEvent.venues?.name;
      const venueAddress = deepLinkedEvent.venues?.address_line1;
      const query = [venueName, venueAddress, "Montréal, QC"].filter(Boolean).join(", ");
      if (query.trim() && mapRef.current && window.google?.maps) {
        console.log("[map deep-link] no stored coords — geocoding:", query);
        const geocoder = new window.google.maps.Geocoder();
        geocoder.geocode({ address: query }, (results, status) => {
          if (status === "OK" && results?.[0]) {
            const loc = results[0].geometry.location;
            console.log("[map deep-link] geocoded to:", loc.lat(), loc.lng());
            mapRef.current?.panTo(loc);
            mapRef.current?.setZoom(15);
          } else {
            console.warn("[map deep-link] geocoding failed:", status);
          }
        });
      } else {
        console.warn("[map deep-link] no venue info to geocode from — map stays at current center");
      }
    }
  }, [deepLinkedEvent, mapsLoaded]);

  // Track when the deep-link selection has actually been committed to React state.
  // This MUST be a separate effect (not inlined into auto-select) so it fires in
  // the render AFTER selected is committed — preventing the exit effect from seeing
  // deepLinkAppliedRef=true and firing prematurely in the same render cycle.
  useEffect(() => {
    if (selected && deepLinkedEvent && selected.id === deepLinkedEvent.id) {
      deepLinkAppliedRef.current = true;
      console.log("[map deep-link] selection committed:", selected.id);
    }
  }, [selected, deepLinkedEvent]);

  // Debounce search so filteredEvents / venueLeaderMap don't recompute on every keystroke.
  // mapSuggestions and the input value still use the raw searchQuery for instant feedback.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  // Persist filter state in URL so navigating to an event and pressing back
  // restores the exact filter configuration. Skipped in deep-link mode
  // (isDeepLinkActiveRef) where the URL is controlled by the eventId param.
  useEffect(() => {
    if (isDeepLinkActiveRef.current) return;
    const params = new URLSearchParams();
    if (selectedCategory !== "all") params.set("cat", selectedCategory);
    if (dateFilter !== "all")        params.set("date", dateFilter);
    if (dateFilter === "pick_date" && pickedDate)    params.set("dateFrom", pickedDate);
    if (dateFilter === "pick_date" && pickedDateEnd) params.set("dateTo",   pickedDateEnd);
    if (timeFilter !== "all") params.set("time", timeFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (debouncedSearchQuery) params.set("q", debouncedSearchQuery);
    const qs = params.toString();
    router.replace(qs ? `/map?${qs}` : "/map", { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, dateFilter, pickedDate, pickedDateEnd, timeFilter, typeFilter, debouncedSearchQuery]);

  const filterActive =
    dateFilter !== "all" || typeFilter !== "all" || timeFilter !== "all";

  // ── Filter sheet helpers ───────────────────────────────────────────────────
  function openFilter() {
    setDraftDateFilter(dateFilter);
    setDraftPickedDate(pickedDate);
    setDraftPickedDateEnd(pickedDateEnd);
    setDraftTimeFilter(timeFilter);
    setDraftTypeFilter(typeFilter);
    setFilterClosing(false);
    setFilterOpen(true);
  }

  function closeFilter() {
    setFilterClosing(true);
    setTimeout(() => {
      setFilterOpen(false);
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
      if (iso === draftPickedDate) {
        setDraftPickedDateEnd(iso);
      } else if (iso < draftPickedDate) {
        setDraftPickedDate(iso);
      } else {
        setDraftPickedDateEnd(iso);
      }
    }
  }

  // ── Default "All" ranking ──────────────────────────────────────────────────
  // Applied only when no user filters are active and search is empty.
  // 1. 14-day window; if < 12 events, expand to 30 days.
  // 2. Sort by distance (if location known), then by start_at ascending.
  // 3. Venue-dedupe: keep only the soonest event per exact lat/lng pair.
  const { defaultEvents, displayLabel, displayDays } = useMemo(() => {
    const now = new Date();

    function withinDays(e: MapEvent, days: number): boolean {
      const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const d = new Date(e.start_at);
      return d >= now && d <= cutoff;
    }

    function haversineKm(
      lat1: number, lng1: number,
      lat2: number, lng2: number,
    ): number {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLng = ((lng2 - lng1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLng / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Step 1: time window with auto-expand fallback
    const window14 = events.filter((e) => withinDays(e, 14));
    const days   = window14.length >= 12 ? 14 : 30;
    const pool   = days === 14 ? window14 : events.filter((e) => withinDays(e, 30));

    // Step 2: sort — distance first (if location known), then soonest
    const sorted = [...pool].sort((a, b) => {
      if (userPos) {
        const aLat = a.venues?.lat, aLng = a.venues?.lng;
        const bLat = b.venues?.lat, bLng = b.venues?.lng;
        if (typeof aLat === "number" && typeof aLng === "number" &&
            typeof bLat === "number" && typeof bLng === "number") {
          const dA = haversineKm(userPos.lat, userPos.lng, aLat, aLng);
          const dB = haversineKm(userPos.lat, userPos.lng, bLat, bLng);
          if (Math.abs(dA - dB) > 0.1) return dA - dB;
        }
      }
      return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
    });

    // Step 3: venue-dedupe — keep soonest event per unique lat/lng
    const seenVenues = new Set<string>();
    const deduped: MapEvent[] = [];
    for (const e of sorted) {
      const lat = e.venues?.lat, lng = e.venues?.lng;
      const key = typeof lat === "number" && typeof lng === "number"
        ? `${lat.toFixed(5)},${lng.toFixed(5)}`
        : e.id; // no venue coords: always include
      if (!seenVenues.has(key)) {
        seenVenues.add(key);
        deduped.push(e);
      }
    }

    return {
      defaultEvents: deduped,
      displayLabel: `Next ${days} days`,
      displayDays: days,
    };
  }, [events, userPos]);

  const filteredEvents = useMemo(() => {
    // When filters/search are active, apply them against the full event pool.
    // When everything is default ("All"), use the ranked default set.
    const isDefault =
      !debouncedSearchQuery.trim() &&
      selectedCategory === "all" &&
      dateFilter === "all" &&
      timeFilter === "all" &&
      typeFilter === "all";

    let result = isDefault ? defaultEvents : events;

    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.venues?.name?.toLowerCase().includes(q) ?? false)
      );
    }

    if (dateFilter !== "all") {
      result = result.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate, pickedDateEnd));
    }

    if (timeFilter !== "all") {
      result = result.filter((e) => {
        const hour = new Date(e.start_at).getHours();
        if (timeFilter === "morning")   return hour >= 6  && hour < 12;
        if (timeFilter === "afternoon") return hour >= 12 && hour < 18;
        if (timeFilter === "evening")   return hour >= 18;
        return true;
      });
    }

    if (selectedCategory !== "all") {
      result = result.filter((e) => normalizeCategory(e.category_primary) === selectedCategory);
    }

    if (typeFilter !== "all") {
      result = result.filter((e) =>
        typeFilter === "private" ? e.source === "manual" : e.source !== "manual"
      );
    }

    return result;
  }, [events, defaultEvents, debouncedSearchQuery, selectedCategory, dateFilter, pickedDate, pickedDateEnd, timeFilter, typeFilter]);

  // Count of events matching draft filters — shown in the filter sheet header.
  const draftFilteredCount = useMemo(() => {
    const isDefault =
      !debouncedSearchQuery.trim() &&
      selectedCategory === "all" &&
      draftDateFilter === "all" &&
      draftTimeFilter === "all" &&
      draftTypeFilter === "all";

    let result = isDefault ? defaultEvents : events;

    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (e) => e.title.toLowerCase().includes(q) || (e.venues?.name?.toLowerCase().includes(q) ?? false)
      );
    }
    if (draftDateFilter !== "all")
      result = result.filter((e) => isInDateWindow(e.start_at, draftDateFilter, draftPickedDate, draftPickedDateEnd));
    if (draftTimeFilter !== "all")
      result = result.filter((e) => {
        const h = new Date(e.start_at).getHours();
        if (draftTimeFilter === "morning")   return h >= 6  && h < 12;
        if (draftTimeFilter === "afternoon") return h >= 12 && h < 18;
        if (draftTimeFilter === "evening")   return h >= 18;
        return true;
      });
    if (selectedCategory !== "all")
      result = result.filter((e) => normalizeCategory(e.category_primary) === selectedCategory);
    if (draftTypeFilter !== "all")
      result = result.filter((e) =>
        draftTypeFilter === "private" ? e.source === "manual" : e.source !== "manual"
      );

    return result.length;
  }, [events, defaultEvents, debouncedSearchQuery, selectedCategory, draftDateFilter, draftPickedDate, draftPickedDateEnd, draftTimeFilter, draftTypeFilter]);

  // All events at the selected venue within the active result set (no dedup).
  // In the default state this uses the same time window as defaultEvents but without
  // venue-dedup so all events at a venue are surfaced in the carousel.
  const venueEvents = useMemo(() => {
    if (!selected) return [];
    // In deep-link mode always show just the one event — bypass pool/date logic
    if (deepLinkedEvent && selected.id === deepLinkedEvent.id) return [deepLinkedEvent];
    const selLat = selected.venues?.lat;
    const selLng = selected.venues?.lng;
    if (typeof selLat !== "number" || typeof selLng !== "number") return [selected];
    const venueKey = `${selLat.toFixed(5)},${selLng.toFixed(5)}`;

    const isDefault =
      !debouncedSearchQuery.trim() &&
      selectedCategory === "all" &&
      dateFilter === "all" &&
      timeFilter === "all" &&
      typeFilter === "all";

    let pool: MapEvent[];

    if (isDefault) {
      const cutoff = new Date(Date.now() + displayDays * 24 * 60 * 60 * 1000);
      const now = new Date();
      pool = events.filter((e) => {
        const d = new Date(e.start_at);
        return d >= now && d <= cutoff;
      });
    } else {
      pool = [...events];
      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            (e.venues?.name?.toLowerCase().includes(q) ?? false),
        );
      }
      if (dateFilter !== "all")
        pool = pool.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate, pickedDateEnd));
      if (timeFilter !== "all") {
        pool = pool.filter((e) => {
          const h = new Date(e.start_at).getHours();
          if (timeFilter === "morning")   return h >= 6  && h < 12;
          if (timeFilter === "afternoon") return h >= 12 && h < 18;
          return h >= 18;
        });
      }
      if (selectedCategory !== "all")
        pool = pool.filter((e) => normalizeCategory(e.category_primary) === selectedCategory);
      if (typeFilter !== "all")
        pool = pool.filter((e) =>
          typeFilter === "private" ? e.source === "manual" : e.source !== "manual",
        );
    }

    return pool
      .filter((e) => {
        const eLat = e.venues?.lat;
        const eLng = e.venues?.lng;
        return (
          typeof eLat === "number" &&
          typeof eLng === "number" &&
          `${eLat.toFixed(5)},${eLng.toFixed(5)}` === venueKey
        );
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, deepLinkedEvent, events, defaultEvents, debouncedSearchQuery, selectedCategory, dateFilter, pickedDate, pickedDateEnd, timeFilter, typeFilter]);

  // Maps each venue key to the soonest upcoming event at that venue in the
  // active pool — used so marker images always match the first carousel card.
  const venueLeaderMap = useMemo(() => {
    const isDefault =
      !debouncedSearchQuery.trim() &&
      selectedCategory === "all" &&
      dateFilter === "all" &&
      timeFilter === "all" &&
      typeFilter === "all";

    let pool: MapEvent[];

    if (isDefault) {
      const now    = new Date();
      const cutoff = new Date(now.getTime() + displayDays * 24 * 60 * 60 * 1000);
      pool = events.filter((e) => {
        const d = new Date(e.start_at);
        return d >= now && d <= cutoff;
      });
    } else {
      pool = [...events];
      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.toLowerCase();
        pool = pool.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            (e.venues?.name?.toLowerCase().includes(q) ?? false),
        );
      }
      if (dateFilter !== "all")
        pool = pool.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate, pickedDateEnd));
      if (timeFilter !== "all") {
        pool = pool.filter((e) => {
          const h = new Date(e.start_at).getHours();
          if (timeFilter === "morning")   return h >= 6  && h < 12;
          if (timeFilter === "afternoon") return h >= 12 && h < 18;
          return h >= 18;
        });
      }
      if (selectedCategory !== "all")
        pool = pool.filter((e) => normalizeCategory(e.category_primary) === selectedCategory);
      if (typeFilter !== "all")
        pool = pool.filter((e) =>
          typeFilter === "private" ? e.source === "manual" : e.source !== "manual",
        );
    }

    // Pure time-ascending sort: first event per venue = soonest upcoming
    pool.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

    const leaders = new Map<string, MapEvent>();
    for (const e of pool) {
      const lat = e.venues?.lat;
      const lng = e.venues?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") continue;
      const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (!leaders.has(key)) leaders.set(key, e);
    }
    return leaders;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, defaultEvents, debouncedSearchQuery, selectedCategory, dateFilter, pickedDate, pickedDateEnd, timeFilter, typeFilter]);

  const mapSuggestions = useMemo(() => {
    if (!searchQuery.trim() || suggestionsDismissed) return [];
    return events
      .map((e) => {
        const candidateText = [e.title, e.venues?.name ?? ""].join(" ");
        const score = wordOverlapScore(searchQuery, candidateText);
        return { event: e, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.event);
  }, [events, searchQuery, suggestionsDismissed]);

  // Close preview card when the selected event is filtered out.
  // Never auto-dismiss the deep-linked event — it may not be in filteredEvents
  // (e.g. private, outside the 14/30-day window, unapproved).
  useEffect(() => {
    if (selected && !filteredEvents.some((e) => e.id === selected.id) && selected.id !== deepLinkedEvent?.id) {
      console.log("[map] clearing selection — event not in filtered set");
      setSelected(null);
    }
  }, [filteredEvents, selected, deepLinkedEvent]);

  // Exit deep-link mode when the user dismisses the tile.
  // Guarded by deepLinkAppliedRef so this CANNOT fire in the same render cycle
  // as auto-select — it only runs after selected has been committed AND then
  // cleared by the user (or by the filter-out effect above).
  useEffect(() => {
    if (!selected && deepLinkedEvent && deepLinkAppliedRef.current) {
      console.log("[map deep-link] exiting focused mode");
      setDeepLinkedEvent(null);
      deepLinkAppliedRef.current = false;
      isDeepLinkActiveRef.current = false;
    }
  }, [selected, deepLinkedEvent]);

  // Fetch upcoming public events that have venue coordinates.
  // Limit is set high enough to cover all foreseeable custom date picks
  // (e.g. May, June, …). The default view uses the 14/30-day defaultEvents
  // subset; explicit date filters operate against this full pool.
  useEffect(() => {
    supabaseBrowser()
      .from("events")
      .select("id,title,start_at,image_url,source,category_primary,venues(lat,lng,name)")
      .eq("city_normalized", "montreal")
      .in("status", ["scheduled", "announced"])
      .eq("is_approved", true)
      .eq("is_rejected", false)
      .eq("visibility", "public")
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(1000)
      .then(({ data }) => setEvents((data ?? []) as unknown as MapEvent[]));
  }, []);

  // Fetch up to 3 attendee avatars whenever the selected event changes
  useEffect(() => {
    if (!selected) { setSelectedAvatars([]); return; }
    type RsvpRow = { profiles: { display_name: string | null; avatar_url: string | null } | { display_name: string | null; avatar_url: string | null }[] | null };
    supabaseBrowser()
      .from("rsvps")
      .select("profiles(display_name,avatar_url)")
      .eq("event_id", selected.id)
      .in("response", ["going", "maybe"])
      .limit(3)
      .then(({ data }) => {
        const avatars: TileAvatar[] = ((data as RsvpRow[]) ?? []).map((row) => {
          const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
          return { url: p?.avatar_url ?? null, name: p?.display_name ?? null };
        });
        setSelectedAvatars(avatars.slice(0, 3));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  // Select a suggestion: pan to it, open preview, dismiss suggestions, blur keyboard.
  // We intentionally keep searchQuery intact so the selected event stays inside
  // filteredEvents (the "close if filtered out" effect would otherwise dismiss the
  // tile 200ms later when the debounce clears the query and filteredEvents recomputes).
  const handleSuggestionSelect = useCallback((event: MapEvent) => {
    setSuggestionsDismissed(true);
    setSelected(event);
    searchInputRef.current?.blur();
    const lat = event.venues?.lat;
    const lng = event.venues?.lng;
    if (mapRef.current && typeof lat === "number" && typeof lng === "number") {
      mapRef.current.panTo({ lat, lng });
    }
  }, []);

  // Dismiss suggestions when clicking outside the search wrapper
  useEffect(() => {
    if (mapSuggestions.length === 0) return;
    function handleOutsideClick(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setSuggestionsDismissed(true);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mapSuggestions.length]);

  // ── Star / interested handler ──────────────────────────────────────────────
  async function handleStar(eventId: string, ev: React.MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!user || !session) {
      window.dispatchEvent(new CustomEvent("outsy:open-signin"));
      return;
    }
    const wasStarred = starredIds.has(eventId);
    setStarPending((p) => { const s = new Set(p); s.add(eventId); return s; });
    setStarredIds((p) => { const s = new Set(p); if (wasStarred) s.delete(eventId); else s.add(eventId); return s; });
    try {
      const res = await fetch(`/api/events/${eventId}/rsvp`, {
        method: wasStarred ? "DELETE" : "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${session.access_token}` },
        ...(wasStarred ? {} : { body: JSON.stringify({ response: "maybe" }) }),
      });
      if (!res.ok) setStarredIds((p) => { const s = new Set(p); if (wasStarred) s.add(eventId); else s.delete(eventId); return s; });
    } catch {
      setStarredIds((p) => { const s = new Set(p); if (wasStarred) s.add(eventId); else s.delete(eventId); return s; });
    } finally {
      setStarPending((p) => { const s = new Set(p); s.delete(eventId); return s; });
    }
  }

  // Also load the current user's starred events for the visible event set.
  useEffect(() => {
    if (!user) return;
    const ids = [...filteredEvents.map((e) => e.id), ...(deepLinkedEvent ? [deepLinkedEvent.id] : [])];
    if (ids.length === 0) return;
    supabaseBrowser()
      .from("rsvps")
      .select("event_id")
      .eq("user_id", user.id)
      .in("event_id", ids)
      .then(({ data }) => {
        if (data) setStarredIds(new Set(data.map((r: { event_id: string }) => r.event_id)));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filteredEvents.map((e) => e.id).join(","), deepLinkedEvent?.id]);

  // Shared helper: store position, place/update the blue dot.
  // Skips panTo when a deep-link event is active so geolocation doesn't override
  // the venue-centered view. isDeepLinkActiveRef is set SYNCHRONOUSLY on mount
  // before any async op, so it is guaranteed to be true before this callback fires.
  const placeUserMarker = useCallback((map: google.maps.Map, lat: number, lng: number) => {
    const pos = { lat, lng };
    userPosRef.current = pos;
    setUserPos(pos); // expose to useMemo so distance-sort updates
    if (isDeepLinkActiveRef.current) {
      console.log("[map geolocation] deep-link active — placing dot but NOT panning");
    } else {
      map.panTo(pos);
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setPosition(pos);
    } else {
      userMarkerRef.current = new google.maps.Marker({
        map,
        position: pos,
        title: "Your location",
        zIndex: 999,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 9,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
      });
    }
  }, []);

  // Initialize map — called by next/script onLoad on first visit, OR directly on
  // remount when the Maps API is already loaded (onLoad won't re-fire for an
  // already-loaded script, causing the white map on navigation return).
  const initMap = useCallback(() => {
    if (!mapDivRef.current || mapRef.current) return;

    // renderingType: RASTER is required — as of Maps JS API v3.55+, the vector
    // renderer is the default even without a mapId. The styles array is silently
    // ignored on the vector renderer. Explicitly forcing RASTER ensures styles apply.
    const map = new google.maps.Map(mapDivRef.current, {
      zoom: 13,
      center: MONTREAL,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: false,
      rotateControl: false,
      cameraControl: false,
      clickableIcons: false,
      renderingType: google.maps.RenderingType.RASTER,
      styles: MAP_STYLES,
    });

    // Force-apply styles immediately after creation as a second guarantee.
    // Some API versions don't honour styles set in the constructor options alone.
    map.setOptions({ styles: MAP_STYLES });

    console.log(
      "[Outsy map] created — mapTypeId:", map.getMapTypeId(),
      "| renderingType:", map.getRenderingType?.(),
      "| styles count:", MAP_STYLES.length,
    );

    mapRef.current = map;

    // ── AvatarMarker — custom HTML marker via OverlayView ──────────────────────
    // AdvancedMarkerElement requires a mapId (vector renderer) which breaks the
    // styles array. OverlayView works on any renderer: we render a circular img
    // div ourselves and handle positioning in draw().
    class AvatarMarker extends google.maps.OverlayView {
      private _pos: google.maps.LatLng;
      content: HTMLElement;
      private _zIndex = 1;

      constructor(
        pos: google.maps.LatLngLiteral,
        imageUrl: string | null,
        category: string,
        zIndex: number,
        onClick: () => void,
      ) {
        super();
        this._pos = new google.maps.LatLng(pos.lat, pos.lng);
        this._zIndex = zIndex;
        this.content = createMarkerEl(imageUrl, false, category);
        this.content.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick();
        });
      }

      // Expose zIndex as a settable property so the icon-swap effect can write
      // m.zIndex = 10 and have it immediately reflected in the CSS z-index.
      get zIndex(): number { return this._zIndex; }
      set zIndex(z: number) {
        this._zIndex = z;
        this.content.style.zIndex = String(z);
      }

      onAdd() {
        // overlayMouseTarget pane sits on top and receives pointer events.
        this.getPanes()!.overlayMouseTarget.appendChild(this.content);
      }

      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const point = proj.fromLatLngToDivPixel(this._pos);
        if (!point) return;
        // position: absolute within the pane; translate(-50%,-50%) centers the
        // circle on the geo-coordinate and auto-adjusts when size changes.
        this.content.style.position = "absolute";
        this.content.style.left = `${point.x}px`;
        this.content.style.top  = `${point.y}px`;
        this.content.style.transform = "translate(-50%, -50%)";
        this.content.style.zIndex = String(this._zIndex);
      }

      onRemove() {
        if (this.content.parentNode) {
          this.content.parentNode.removeChild(this.content);
        }
      }
    }
    avatarMarkerClassRef.current = AvatarMarker;

    // Tapping the map background dismisses the preview card
    map.addListener("click", () => setSelected(null));

    // Show user location dot and pan to it if permission is granted
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => placeUserMarker(map, coords.latitude, coords.longitude),
      () => {} // Permission denied — map stays centered on Montréal
    );

    setMapsLoaded(true);
  }, [placeUserMarker]);

  // When returning to /map, the component remounts fresh but the Google Maps
  // script is already loaded — onLoad won't fire again. Call initMap directly
  // if the API is available and we haven't initialized yet.
  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.maps && !mapRef.current) {
      initMap();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter button handler
  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userPosRef.current) {
      // Location already known — smooth pan
      map.panTo(userPosRef.current);
      return;
    }

    // Location not yet fetched — request it now
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => placeUserMarker(map, coords.latitude, coords.longitude),
      () => {} // Still denied — do nothing
    );
  }, [placeUserMarker]);

  // Keep venueLeaderMapRef in sync so the marker effect can read it without
  // being a React dep (venueLeaderMap and filteredEvents share the same filter
  // deps and always change together, so the ref is always current when the effect runs).
  venueLeaderMapRef.current = venueLeaderMap;

  // Place markers whenever events data or map readiness changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsLoaded) return;

    if (deepLinkedEvent) {
      // Deep-link mode: clear all regular markers; deep-linked marker effect places the single one
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = new Map();
      prevMarkerKeyRef.current = ""; // reset so normal mode rebuilds when deep-link exits
      prevSelectedIdRef.current = null;
      return;
    }

    // Skip full rebuild when the event set hasn't changed (e.g. userPos update
    // that only affects defaultEvents sort order but not the visible event IDs).
    const markerKey = filteredEvents.map((e) => e.id).join(",");
    if (markerKey === prevMarkerKeyRef.current) return;
    prevMarkerKeyRef.current = markerKey;

    // Remove previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = new Map();
    prevSelectedIdRef.current = null;

    // AvatarMarker uses OverlayView — raster-compatible custom HTML markers.
    const AvatarMarkerClass = avatarMarkerClassRef.current;
    if (!AvatarMarkerClass) return;

    filteredEvents.forEach((event) => {
      const lat = event.venues?.lat;
      const lng = event.venues?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      // Use the soonest event at this venue as the visual source for the marker,
      // so the marker image always matches the first card in the venue carousel.
      const venueKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const leader   = venueLeaderMapRef.current.get(venueKey) ?? event;

      const marker = new AvatarMarkerClass(
        { lat, lng },
        leader.image_url,
        leader.category_primary,
        1,
        () => {
          setSelected(event); // keep filteredEvents id so icon-swap + dismiss logic works
          map.panTo({ lat, lng });
        },
      );
      marker.setMap(map);
      markersRef.current.set(event.id, marker);
    });
  }, [filteredEvents, mapsLoaded, deepLinkedEvent]);

  // Place a marker for the deep-linked event when it's not already in filteredEvents.
  // This effect is defined AFTER the main marker effect so it runs after markers are rebuilt.
  // Falls back to the URL-baked lat/lng so private events with no stored venue coords still get a marker.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsLoaded || !deepLinkedEvent) return;
    if (markersRef.current.has(deepLinkedEvent.id)) return; // main effect already placed it
    // Prefer venue coords from the fetched event; fall back to URL params
    const lat = deepLinkedEvent.venues?.lat ?? deepLinkCoordsRef.current.lat;
    const lng = deepLinkedEvent.venues?.lng ?? deepLinkCoordsRef.current.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    console.log("[map deep-link] placing marker at", lat, lng, deepLinkedEvent.title);

    const AvatarMarkerClass = avatarMarkerClassRef.current;
    if (!AvatarMarkerClass) return;

    const marker = new AvatarMarkerClass(
      { lat, lng },
      deepLinkedEvent.image_url,
      deepLinkedEvent.category_primary,
      1,
      () => {
        setSelected(deepLinkedEvent);
        map.panTo({ lat, lng });
      },
    );
    marker.setMap(map);
    markersRef.current.set(deepLinkedEvent.id, marker);
  }, [deepLinkedEvent, mapsLoaded, filteredEvents]);

  // Swap marker icon when selected event changes
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const nextId = selected?.id ?? null;
    if (prevId === nextId) return;

    if (prevId) {
      const m = markersRef.current.get(prevId);
      if (m?.content instanceof HTMLElement) {
        updateMarkerEl(m.content, false);
        m.zIndex = 1;
      } else {
        m?.setIcon?.(MARKER_DEFAULT);
        m?.setZIndex?.(1);
      }
    }
    if (nextId) {
      const m = markersRef.current.get(nextId);
      if (m?.content instanceof HTMLElement) {
        updateMarkerEl(m.content, true);
        m.zIndex = 10;
      } else {
        m?.setIcon?.(MARKER_SELECTED);
        m?.setZIndex?.(10);
      }
    }
    prevSelectedIdRef.current = nextId;
  }, [selected]);

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=marker,places`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      {/* Full-viewport map container — position:fixed removes it from the
          document flow so body:has(.bottom-nav) padding-bottom doesn't create
          a white strip below the map. Covers the full screen behind BottomNav. */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden" }}>

        {/* Google Maps canvas — no CSS filter; style array carries the visual design */}
        <div
          ref={mapDivRef}
          style={{
            width: "100%",
            height: "100%",
          }}
        />

        {/* Top edge fade — subtle vignette to anchor search bar; much lighter than before */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 110,
            background: "linear-gradient(to bottom, rgba(11,15,20,0.72) 0%, rgba(11,15,20,0.30) 55%, transparent 100%)",
            pointerEvents: "none",
            zIndex: 8,
          }}
        />

        {/* Bottom edge fade — light vignette, event card shadow does the separation */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 120,
            background: "linear-gradient(to top, rgba(11,15,20,0.60) 0%, rgba(11,15,20,0.20) 60%, transparent 100%)",
            pointerEvents: "none",
            zIndex: 8,
          }}
        />

        {/* Top overlay — back + search + filter button (row 1) + category chips (row 2) */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 9,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* Row 1: back · search · filter */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <BackButton
              className="map-overlay-btn"
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(13,19,28,0.88)",
                backdropFilter: "blur(16px) saturate(160%)",
                WebkitBackdropFilter: "blur(16px) saturate(160%)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)",
                cursor: "pointer",
                color: "#F5F7FA",
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </BackButton>

            <div ref={searchWrapperRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Search events or venues"
                placeholder="Search events or venues"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSuggestionsDismissed(false); }}
                onFocus={() => setSuggestionsDismissed(false)}
                className="map-search-input"
                style={{
                  width: "100%",
                  height: 44,
                  borderRadius: mapSuggestions.length > 0 ? "22px 22px 0 0" : 22,
                  border: "1px solid rgba(255,255,255,0.12)",
                  padding: searchQuery ? "0 40px 0 16px" : "0 16px",
                  fontSize: 16,
                  background: "rgba(13,19,28,0.88)",
                  backdropFilter: "blur(16px) saturate(160%)",
                  WebkitBackdropFilter: "blur(16px) saturate(160%)",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)",
                  color: "#F5F7FA",
                  boxSizing: "border-box",
                }}
              />

              {/* Clear button — visible only when input has text */}
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onMouseDown={(e) => {
                    e.preventDefault(); // prevent input blur before clear fires
                    setSearchQuery("");
                    setDebouncedSearchQuery("");
                    setSuggestionsDismissed(true);
                  }}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 4,
                    color: "rgba(245,247,250,0.45)",
                    zIndex: 1,
                    touchAction: "manipulation",
                  }}
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}

              {/* Suggestion dropdown */}
              {mapSuggestions.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "rgba(13,19,28,0.96)",
                    backdropFilter: "blur(20px) saturate(160%)",
                    WebkitBackdropFilter: "blur(20px) saturate(160%)",
                    borderRadius: "0 0 16px 16px",
                    border: "1px solid rgba(255,255,255,0.10)",
                    borderTop: "none",
                    boxShadow: "0 12px 36px rgba(0,0,0,0.65), 0 2px 6px rgba(0,0,0,0.40)",
                    overflow: "hidden",
                    zIndex: 20,
                  }}
                >
                  {mapSuggestions.map((evt) => (
                    <button
                      key={evt.id}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSuggestionSelect(evt); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "8px 12px",
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      {evt.image_url ? (
                        <img
                          src={evt.image_url}
                          alt=""
                          style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#7c3aed",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#F5F7FA",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {evt.title}
                        </div>
                        {evt.venues?.name && (
                          <div
                            style={{
                              fontSize: 11,
                              color: "rgba(245,247,250,0.50)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {evt.venues.name}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              aria-label="Open filters"
              onClick={() => openFilter()}
              className="map-overlay-btn"
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: filterActive ? "none" : "1px solid rgba(255,255,255,0.12)",
                background: filterActive ? "#2563EB" : "rgba(13,19,28,0.88)",
                backdropFilter: filterActive ? "none" : "blur(16px) saturate(160%)",
                WebkitBackdropFilter: filterActive ? "none" : "blur(16px) saturate(160%)",
                boxShadow: filterActive
                  ? "0 2px 16px rgba(37,99,235,0.55), 0 1px 4px rgba(0,0,0,0.40)"
                  : "0 4px 24px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#F5F7FA",
                touchAction: "manipulation",
              }}
            >
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="6" x2="20" y2="6" />
                <line x1="8" y1="12" x2="20" y2="12" />
                <line x1="12" y1="18" x2="20" y2="18" />
                <circle cx="4" cy="12" r="2" fill="currentColor" stroke="none" />
                <circle cx="8" cy="6"  r="2" fill="currentColor" stroke="none" />
                <circle cx="12" cy="18" r="2" fill="currentColor" stroke="none" />
              </svg>
            </button>
          </div>

          {/* Row 2: category chips */}
          <div
            className="chip-row"
            style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}
          >
            {MAP_CATEGORIES.map((cat) => {
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="map-overlay-btn"
                  style={{
                    flexShrink: 0,
                    padding: "7px 14px",
                    borderRadius: 20,
                    border: isActive ? "none" : "1px solid rgba(255,255,255,0.11)",
                    background: isActive ? "#2563EB" : "rgba(13,19,28,0.88)",
                    backdropFilter: isActive ? "none" : "blur(14px) saturate(150%)",
                    WebkitBackdropFilter: isActive ? "none" : "blur(14px) saturate(150%)",
                    color: "#F5F7FA",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isActive
                      ? "0 2px 12px rgba(37,99,235,0.50)"
                      : "0 3px 14px rgba(0,0,0,0.55), 0 1px 3px rgba(0,0,0,0.35)",
                    touchAction: "manipulation",
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Contextual window label — only shown in default "All" state */}
          {!filterActive && !searchQuery.trim() && selectedCategory === "all" && (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  padding: "4px 12px",
                  borderRadius: 20,
                  background: "rgba(13,19,28,0.88)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "rgba(245,247,250,0.65)",
                  boxShadow: "0 3px 14px rgba(0,0,0,0.55)",
                  letterSpacing: "0.02em",
                }}
              >
                {displayLabel}
              </div>
            </div>
          )}
        </div>

        {/* Recenter button — shifts up when preview card is visible */}
        {mapsLoaded && (
          <button
            type="button"
            aria-label="Center on my location"
            onClick={handleRecenter}
            className="map-overlay-btn"
            style={{
              position: "absolute",
              right: 12,
              bottom: selected ? "max(272px, calc(env(safe-area-inset-bottom, 0px) + 264px))" : 24,
              transition: "bottom 0.2s ease",
              zIndex: 9,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(13,19,28,0.88)",
              backdropFilter: "blur(16px) saturate(160%)",
              WebkitBackdropFilter: "blur(16px) saturate(160%)",
              boxShadow: "0 4px 24px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#F5F7FA",
              touchAction: "manipulation",
            }}
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L4.5 20.5 L12 17 L19.5 20.5 Z" />
            </svg>
          </button>
        )}

        {/* Event preview — single card or venue carousel
            bottom clears the floating BottomNav (≈76px tall + 16px bottom margin)
            plus safe-area-inset-bottom on iPhone. 96px covers this on all devices. */}
        {selected && (
          <div
            style={{
              position: "absolute",
              bottom: "max(96px, calc(env(safe-area-inset-bottom, 0px) + 96px))",
              left: 0,
              right: 0,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Venue pill — shown only for multi-event venues */}
            {venueEvents.length > 1 && selected.venues?.name && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    background: "rgba(16,23,34,0.88)",
                    backdropFilter: "blur(14px) saturate(160%)",
                    WebkitBackdropFilter: "blur(14px) saturate(160%)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#F5F7FA",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.50)",
                    maxWidth: "calc(100% - 48px)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selected.venues.name}
                  <span style={{ fontWeight: 400, opacity: 0.55, marginLeft: 6 }}>
                    {venueEvents.length} upcoming
                  </span>
                </div>
              </div>
            )}

            {/* Tile row — single card centered, multiple cards scroll.
                paddingLeft/Right on a scroll container keeps the first/last tile
                16px away from the screen edge. scrollPaddingLeft aligns snap
                targets with the padded content edge (not the container edge). */}
            <div
              className="chip-row"
              style={{
                display: "flex",
                gap: 12,
                overflowX: venueEvents.length > 1 ? "auto" : "visible",
                justifyContent: venueEvents.length === 1 ? "center" : "flex-start",
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 4,
                scrollSnapType: "x mandatory",
                scrollPaddingLeft: 16,
              }}
            >
              {(venueEvents.length > 1 ? venueEvents : [selected]).map((evt, i) => {
                const starred = starredIds.has(evt.id);
                const pending = starPending.has(evt.id);
                const pressed = starPressed.has(evt.id);
                const avatars = i === 0 ? selectedAvatars : [];
                const venueLabel = evt.venues?.name ?? null;
                const infoLine = [smartDate(evt.start_at), venueLabel].filter(Boolean).join(" · ");
                return (
                  <Link
                    key={evt.id}
                    href={`/events/${evt.id}`}
                    onClick={(e) => { e.stopPropagation(); router.push(`/events/${evt.id}`); e.preventDefault(); }}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      flexShrink: 0,
                      scrollSnapAlign: "start",
                      display: "block",
                      // Single card: 100% of padded width up to 340px.
                      // Multi-card: fixed width matching This week tiles.
                      width: venueEvents.length === 1 ? "min(calc(100vw - 32px), 340px)" : 255,
                    }}
                  >
                    <div
                      style={{
                        position: "relative",
                        width: "100%",
                        height: venueEvents.length === 1 ? 200 : 182,
                        borderRadius: 15,
                        overflow: "hidden",
                        transform: "translateZ(0)",
                        background: categoryBg(evt.category_primary),
                        boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.40)",
                      }}
                    >
                      {/* Image */}
                      {evt.image_url && (
                        <img src={evt.image_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                      {/* Top gradient — darkens for avatar/button contrast */}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,28,28,0.6) 0%, rgba(28,28,28,0) 22%)", pointerEvents: "none" }} />
                      {/* Bottom gradient — text legibility */}
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(28,28,28,0.13) 68%, #1c1c1c 100%)", pointerEvents: "none" }} />

                      {/* Attendee avatars — top left */}
                      {avatars.length > 0 && (
                        <div style={{ position: "absolute", top: 8, left: 8, display: "flex", alignItems: "center" }}>
                          {avatars.slice(0, 3).map((a, idx) =>
                            a.url ? (
                              <img key={idx} src={a.url} alt="" style={{ width: 19, height: 19, borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(0,0,0,0.5)", display: "block", marginLeft: idx > 0 ? -6 : 0 }} />
                            ) : (
                              <div key={idx} style={{ width: 19, height: 19, borderRadius: "50%", background: getAvatarColor(a.name), border: "1.5px solid rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff", marginLeft: idx > 0 ? -6 : 0 }}>
                                {getInitials(a.name)}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {/* Star / interested button — top right */}
                      <button
                        type="button"
                        aria-label={starred ? "Remove from saved" : "Save event"}
                        onClick={(ev) => handleStar(evt.id, ev)}
                        onPointerDown={() => setStarPressed((s) => { const n = new Set(s); n.add(evt.id); return n; })}
                        onPointerUp={() => setStarPressed((s) => { const n = new Set(s); n.delete(evt.id); return n; })}
                        onPointerLeave={() => setStarPressed((s) => { const n = new Set(s); n.delete(evt.id); return n; })}
                        style={{
                          position: "absolute", top: 7, right: 8,
                          width: 26, height: 26, borderRadius: "50%", border: "none",
                          background: starred ? "rgba(94,168,255,0.85)" : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: pending ? "wait" : "pointer",
                          opacity: pending ? 0.6 : 1,
                          padding: 0,
                          transform: pressed ? "scale(0.95)" : "scale(1)",
                          transition: "transform 0.12s ease, background 0.15s ease",
                        }}
                      >
                        <svg width="15" height="15" viewBox="0 0 18 18" fill={starred ? "#fff" : "none"} stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path fillRule="evenodd" clipRule="evenodd" d="M8.81244 3.375C8.74419 3.375 8.57619 3.39375 8.48694 3.57225L7.11744 6.3105C6.90069 6.74325 6.48294 7.044 5.99994 7.113L2.93394 7.55475C2.73144 7.584 2.66244 7.734 2.64144 7.797C2.62269 7.85775 2.59269 8.01225 2.73219 8.14575L4.94919 10.2758C5.30244 10.6155 5.46294 11.1053 5.37894 11.5845L4.85694 14.592C4.82469 14.7802 4.94244 14.8897 4.99494 14.9272C5.05044 14.9692 5.19894 15.0525 5.38269 14.9565L8.12394 13.5353C8.55594 13.3125 9.07044 13.3125 9.50094 13.5353L12.2414 14.9557C12.4259 15.051 12.5744 14.9677 12.6307 14.9272C12.6832 14.8897 12.8009 14.7802 12.7687 14.592L12.2452 11.5845C12.1612 11.1053 12.3217 10.6155 12.6749 10.2758L14.8919 8.14575C15.0322 8.01225 15.0022 7.857 14.9827 7.797C14.9624 7.734 14.8934 7.584 14.6909 7.55475L11.6249 7.113C11.1427 7.044 10.7249 6.74325 10.5082 6.30975L9.13719 3.57225C9.04869 3.39375 8.88069 3.375 8.81244 3.375Z" />
                        </svg>
                      </button>

                      {/* Title + info — centered at bottom */}
                      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 9px 11px", textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#F5F7FA", lineHeight: 1.15, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {evt.title}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "#F5F7FA", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, opacity: 0.85 }}>
                          {infoLine}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filter bottom sheet */}
      {filterOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && closeFilter()}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 200,
            display: "flex",
            alignItems: "flex-end",
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

              {/* Title + count */}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
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
                          padding: "7px 14px",
                          borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {/* Inline calendar */}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
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
                          padding: "7px 14px",
                          borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
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
                <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 10 }}>
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
                          padding: "7px 14px",
                          borderRadius: 20,
                          border: isActive ? "none" : "1px solid rgba(255,255,255,0.10)",
                          background: isActive
                            ? "linear-gradient(135deg, #5EA8FF 0%, #2563EB 100%)"
                            : "rgba(255,255,255,0.07)",
                          color: isActive ? "#fff" : "rgba(255,255,255,0.70)",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
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
    </>
  );
}

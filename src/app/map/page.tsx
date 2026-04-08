/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { BackButton } from "../events/[id]/BackButton";

const MONTREAL = { lat: 45.5017, lng: -73.5673 };
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
// Required for AdvancedMarkerElement (round image markers).
// Create a Map ID in Google Cloud Console → Maps → Manage Map IDs,
// then add NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID to .env.local.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "";

// ── Custom map style ──────────────────────────────────────────────────────────
// Warm off-white base, muted POIs, soft roads — clean and readable.
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry",                           stylers: [{ color: "#faf8f5" }] },
  { elementType: "labels.text.stroke",                 stylers: [{ color: "#faf8f5" }] },
  { elementType: "labels.text.fill",                   stylers: [{ color: "#7a7570" }] },
  // Water
  { featureType: "water", elementType: "geometry",     stylers: [{ color: "#c8d8ea" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#8fa8c2" }] },
  // Landscape
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#f5f2ed" }] },
  // Parks — keep readable, soft sage
  { featureType: "poi.park", elementType: "geometry",          stylers: [{ color: "#daebd2" }] },
  { featureType: "poi.park", elementType: "labels.text.fill",  stylers: [{ color: "#6d956a" }] },
  { featureType: "poi.park", elementType: "labels.icon",       stylers: [{ visibility: "off" }] },
  // POIs — hide icons and business clutter
  { featureType: "poi",          elementType: "labels.icon",      stylers: [{ visibility: "off" }] },
  { featureType: "poi.business",                                   stylers: [{ visibility: "off" }] },
  { featureType: "poi",          elementType: "labels.text.fill",  stylers: [{ color: "#b0aba6" }] },
  // Roads
  { featureType: "road",          elementType: "geometry",          stylers: [{ color: "#ffffff" }] },
  { featureType: "road.arterial", elementType: "geometry",          stylers: [{ color: "#ede9e4" }] },
  { featureType: "road.highway",  elementType: "geometry",          stylers: [{ color: "#e5e0d8" }] },
  { featureType: "road.highway",  elementType: "geometry.stroke",   stylers: [{ color: "#d8d3cb" }] },
  { featureType: "road",          elementType: "labels.text.fill",  stylers: [{ color: "#8a8580" }] },
  { featureType: "road",          elementType: "labels.icon",       stylers: [{ visibility: "off" }] },
  // Transit — minimal
  { featureType: "transit",         elementType: "labels.icon",       stylers: [{ visibility: "off" }] },
  { featureType: "transit.line",    elementType: "geometry",          stylers: [{ color: "#ddd8d0" }] },
  { featureType: "transit.station", elementType: "labels.text.fill",  stylers: [{ color: "#a09890" }] },
  // Administrative
  { featureType: "administrative.locality",     elementType: "labels.text.fill", stylers: [{ color: "#666260" }] },
  { featureType: "administrative.neighborhood", elementType: "labels.text.fill", stylers: [{ color: "#9a9490" }] },
];

// ── Legacy circle icons (fallback when MAP_ID is not set) ─────────────────────
// path: 0 === google.maps.SymbolPath.CIRCLE (numeric value, safe at module level)
const MARKER_DEFAULT: google.maps.Symbol = {
  path: 0 as google.maps.SymbolPath,
  scale: 7,
  fillColor: "#7c3aed",
  fillOpacity: 1,
  strokeColor: "#ffffff",
  strokeWeight: 1.5,
};

const MARKER_SELECTED: google.maps.Symbol = {
  path: 0 as google.maps.SymbolPath,
  scale: 11,
  fillColor: "#7c3aed",
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

// Single-element circle — AdvancedMarkerElement anchors at bottom-center of the
// content element, so one div is correct; wrapping with translate(-50%,-50%)
// conflicts with the API's own positioning and must not be added.
function createMarkerEl(imageUrl: string | null, selected: boolean, category = ""): HTMLElement {
  const size   = selected ? 52 : 40;
  const border = selected ? "3px solid #fff" : "2px solid rgba(255,255,255,0.90)";
  const shadow = selected
    ? "0 0 0 2px #7c3aed, 0 4px 20px rgba(0,0,0,0.40)"
    : "0 1px 8px rgba(0,0,0,0.30)";

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
    ? "0 0 0 2px #7c3aed, 0 4px 20px rgba(0,0,0,0.40)"
    : "0 1px 8px rgba(0,0,0,0.30)";
}

type MapEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  source: string;
  category_primary: string;
  venues: { lat: number | null; lng: number | null; name: string | null } | null;
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


function formatEventDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" }) ===
    now.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

  const time = d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today · ${time}`;

  return d.toLocaleString("en-US", {
    timeZone: "America/Toronto",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ── Shared event card used in both single-card and carousel modes ─────────────
function EventCard({ event, avatars }: { event: MapEvent; avatars: TileAvatar[] }) {
  return (
    <div style={{ position: "relative", width: "100%", paddingBottom: "62%", background: "#1a1020" }}>
      {event.image_url && (
        <img
          src={event.image_url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 75%, transparent 100%)",
        }}
      />

      {/* Star badge */}
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 30,
          height: 30,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.42)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </div>

      {/* Attendee avatars */}
      {avatars.length > 0 && (
        <div style={{ position: "absolute", bottom: 10, right: 10, display: "flex", flexDirection: "row-reverse" }}>
          {avatars.map((a, i) =>
            a.url ? (
              <img
                key={i}
                src={a.url}
                alt=""
                style={{
                  width: 22, height: 22, borderRadius: "50%", objectFit: "cover",
                  border: "2px solid rgba(0,0,0,0.5)", marginLeft: i > 0 ? -6 : 0,
                }}
              />
            ) : (
              <div
                key={i}
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: getAvatarColor(a.name),
                  border: "2px solid rgba(0,0,0,0.5)", marginLeft: i > 0 ? -6 : 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, fontWeight: 700, color: "#fff",
                }}
              >
                {getInitials(a.name)}
              </div>
            )
          )}
        </div>
      )}

      {/* Text overlay */}
      <div
        style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 2,
        }}
      >
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
          {formatEventDate(event.start_at)}
        </div>
        <div
          style={{
            fontSize: 15, fontWeight: 700, color: "#fff", lineHeight: 1.25,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {event.title}
        </div>
        {event.venues?.name && (
          <div
            style={{
              fontSize: 12, color: "rgba(255,255,255,0.55)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {event.venues.name}
          </div>
        )}
      </div>
    </div>
  );
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
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.55, padding: "0 8px", lineHeight: 1 }}
        >
          ‹
        </button>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.55, padding: "0 8px", lineHeight: 1 }}
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 2 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, opacity: 0.4, padding: "2px 0" }}>
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

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayTap(iso)}
              style={{
                textAlign: "center",
                padding: "6px 2px",
                border: "none",
                cursor: "pointer",
                borderRadius: 6,
                fontSize: 13,
                fontWeight: isSelected ? 700 : 400,
                background: isSelected
                  ? "#7c3aed"
                  : inRange
                  ? "rgba(124,58,237,0.14)"
                  : "transparent",
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

      {/* Selection hint */}
      {start && !end && (
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8, textAlign: "center" }}>
          Tap a second date to set a range
        </div>
      )}
    </div>
  );
}

export default function MapPage() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [deepLinkedEvent, setDeepLinkedEvent] = useState<MapEvent | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [selectedAvatars, setSelectedAvatars] = useState<TileAvatar[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MapCategory>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [pickedDate, setPickedDate] = useState("");
  const [pickedDateEnd, setPickedDateEnd] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
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

  // Deep-link: parse ?eventId= (+ optional ?lat=&lng=) on mount.
  // lat/lng come from the event page (server-rendered, always accurate) so we can
  // center the map immediately — before the async Supabase fetch completes.
  const deepLinkRef = useRef<{ eventId: string; lat: number | null; lng: number | null } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get("eventId");
    if (eventId) {
      const rawLat = parseFloat(params.get("lat") ?? "");
      const rawLng = parseFloat(params.get("lng") ?? "");
      deepLinkRef.current = {
        eventId,
        lat: isNaN(rawLat) ? null : rawLat,
        lng: isNaN(rawLng) ? null : rawLng,
      };
      // Fetch the event independently — no date/approval/visibility filter so
      // events outside the default 14/30-day window and private events both work.
      supabaseBrowser()
        .from("events")
        .select("id,title,start_at,image_url,source,category_primary,venues(lat,lng,name)")
        .eq("id", eventId)
        .single()
        .then(({ data }) => { if (data) setDeepLinkedEvent(data as unknown as MapEvent); });
    } else {
      const q = params.get("q");
      if (q) { setSearchQuery(q); setDebouncedSearchQuery(q); }
    }
  }, []);

  // As soon as the map is ready and we have URL-provided coordinates, center
  // immediately — before the async Supabase fetch for the event completes.
  // This makes the map focus feel instant even for events outside the discovery
  // window (next month, private, unapproved) where the fetch might be slow or fail.
  useEffect(() => {
    if (!mapsLoaded || !deepLinkRef.current) return;
    const { lat, lng } = deepLinkRef.current;
    if (typeof lat === "number" && typeof lng === "number") {
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(15);
    }
  }, [mapsLoaded]);

  // Auto-select deep-linked event once both the event data and map are ready.
  useEffect(() => {
    if (!deepLinkRef.current || !deepLinkedEvent || !mapsLoaded) return;
    setSelected(deepLinkedEvent);
    const lat = deepLinkedEvent.venues?.lat;
    const lng = deepLinkedEvent.venues?.lng;
    if (typeof lat === "number" && typeof lng === "number") {
      mapRef.current?.panTo({ lat, lng });
      mapRef.current?.setZoom(15);
    }
    deepLinkRef.current = null; // apply only once
  }, [deepLinkedEvent, mapsLoaded]);

  // Debounce search so filteredEvents / venueLeaderMap don't recompute on every keystroke.
  // mapSuggestions and the input value still use the raw searchQuery for instant feedback.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const filterActive =
    dateFilter !== "all" || typeFilter !== "all" || timeFilter !== "all";

  // Tap-tap date selection: first tap = start, second tap = end (or same = single day)
  function handleDateTap(iso: string) {
    if (pickedDate === "" || pickedDateEnd !== "") {
      // No selection yet, or a complete range is already set → start fresh
      setPickedDate(iso);
      setPickedDateEnd("");
      setDateFilter("pick_date");
    } else {
      // Start is set, waiting for end
      if (iso === pickedDate) {
        setPickedDateEnd(iso); // same date twice → single-day
      } else if (iso < pickedDate) {
        setPickedDate(iso);    // earlier date → reset start
      } else {
        setPickedDateEnd(iso); // later date → set range end
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

  // Close preview card when the selected event is filtered out,
  // but never auto-dismiss the deep-linked event (it may not be in filteredEvents).
  useEffect(() => {
    if (selected && !filteredEvents.some((e) => e.id === selected.id) && selected.id !== deepLinkedEvent?.id) {
      setSelected(null);
    }
  }, [filteredEvents, selected, deepLinkedEvent]);

  // Exit deep-link mode when the tile is dismissed — map reverts to default view.
  // Only after auto-select has run (deepLinkRef.current becomes null) to avoid
  // immediately clearing deepLinkedEvent before selection is applied.
  useEffect(() => {
    if (!selected && deepLinkedEvent && deepLinkRef.current === null) {
      setDeepLinkedEvent(null);
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

  // Shared helper: store position, pan map, place/update the blue dot
  const placeUserMarker = useCallback((map: google.maps.Map, lat: number, lng: number) => {
    const pos = { lat, lng };
    userPosRef.current = pos;
    setUserPos(pos); // expose to useMemo so distance-sort updates
    map.panTo(pos);

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
      // mapId is needed for AdvancedMarkerElement (round image markers).
      // styles is used when no mapId is set; on vector maps it is ignored.
      ...(MAP_ID ? { mapId: MAP_ID } : { styles: MAP_STYLES }),
    });

    mapRef.current = map;

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

    // AdvancedMarkerElement requires a mapId on the Map instance.
    // Only enable it when MAP_ID is configured; otherwise fall back to legacy Marker.
    const AdvancedMarker = MAP_ID
      ? (google.maps.marker as typeof google.maps.marker)?.AdvancedMarkerElement ?? null
      : null;

    filteredEvents.forEach((event) => {
      const lat = event.venues?.lat;
      const lng = event.venues?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      // Use the soonest event at this venue as the visual source for the marker,
      // so the marker image always matches the first card in the venue carousel.
      const venueKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      const leader   = venueLeaderMapRef.current.get(venueKey) ?? event;

      let marker;

      if (AdvancedMarker) {
        marker = new AdvancedMarker({
          map,
          position: { lat, lng },
          content: createMarkerEl(leader.image_url, false, leader.category_primary),
          title: leader.title,
          zIndex: 1,
        });
      } else {
        // True last-resort fallback (marker library absent)
        marker = new google.maps.Marker({
          map,
          position: { lat, lng },
          title: leader.title,
          icon: MARKER_DEFAULT,
          zIndex: 1,
        });
      }

      marker.addListener("click", () => {
        setSelected(event); // keep filteredEvents id so icon-swap + dismiss logic works
        map.panTo({ lat, lng });
      });

      markersRef.current.set(event.id, marker);
    });
  }, [filteredEvents, mapsLoaded, deepLinkedEvent]);

  // Place a marker for the deep-linked event when it's not already in filteredEvents.
  // This effect is defined AFTER the main marker effect so it runs after markers are rebuilt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsLoaded || !deepLinkedEvent) return;
    if (markersRef.current.has(deepLinkedEvent.id)) return; // main effect already placed it
    const lat = deepLinkedEvent.venues?.lat;
    const lng = deepLinkedEvent.venues?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;

    const AdvancedMarker = MAP_ID
      ? (google.maps.marker as typeof google.maps.marker)?.AdvancedMarkerElement ?? null
      : null;

    let marker;
    if (AdvancedMarker) {
      marker = new AdvancedMarker({
        map,
        position: { lat, lng },
        content: createMarkerEl(deepLinkedEvent.image_url, false, deepLinkedEvent.category_primary),
        title: deepLinkedEvent.title,
        zIndex: 1,
      });
    } else {
      marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: deepLinkedEvent.title,
        icon: MARKER_DEFAULT,
        zIndex: 1,
      });
    }
    marker.addListener("click", () => {
      setSelected(deepLinkedEvent);
      map.panTo({ lat, lng });
    });
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

      {/* Full-height container below the sticky header */}
      <div style={{ position: "relative", height: "calc(100dvh - 57px)", overflow: "hidden" }}>

        {/* Google Maps canvas */}
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

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
                border: "none",
                background: "rgba(255,255,255,0.88)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
                cursor: "pointer",
                color: "#333",
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
                  border: "none",
                  padding: searchQuery ? "0 40px 0 16px" : "0 16px",
                  fontSize: 16,
                  background: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
                  color: "#1c1917",
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
                    color: "#78716c",
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
                    background: "rgba(255,255,255,0.96)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    borderRadius: "0 0 16px 16px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
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
                            color: "#1c1917",
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
                              color: "#78716c",
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
              onClick={() => setFilterOpen(true)}
              className="map-overlay-btn"
              style={{
                flexShrink: 0,
                width: 44,
                height: 44,
                borderRadius: "50%",
                border: "none",
                background: filterActive ? "#7c3aed" : "rgba(255,255,255,0.88)",
                backdropFilter: filterActive ? "none" : "blur(12px)",
                WebkitBackdropFilter: filterActive ? "none" : "blur(12px)",
                boxShadow: filterActive
                  ? "0 2px 12px rgba(124,58,237,0.35)"
                  : "0 2px 12px rgba(0,0,0,0.16)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: filterActive ? "#fff" : "#333",
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
                    border: "none",
                    background: isActive ? "#7c3aed" : "rgba(255,255,255,0.88)",
                    backdropFilter: isActive ? "none" : "blur(8px)",
                    WebkitBackdropFilter: isActive ? "none" : "blur(8px)",
                    color: isActive ? "#fff" : "#1c1917",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: isActive
                      ? "0 2px 8px rgba(124,58,237,0.30)"
                      : "0 1px 6px rgba(0,0,0,0.14)",
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
                  background: "rgba(255,255,255,0.78)",
                  backdropFilter: "blur(10px)",
                  WebkitBackdropFilter: "blur(10px)",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#78716c",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.10)",
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
              bottom: selected ? 250 : 24,
              transition: "bottom 0.2s ease",
              zIndex: 9,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.88)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#333",
              touchAction: "manipulation",
            }}
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L4.5 20.5 L12 17 L19.5 20.5 Z" />
            </svg>
          </button>
        )}

        {/* Event preview — single card or venue carousel */}
        {selected && venueEvents.length === 1 && (
          /* ── Single event: existing centered card ─────────────────────── */
          <Link href={`/events/${selected.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                position: "absolute",
                bottom: "calc(26px + env(safe-area-inset-bottom, 0px))",
                left: "50%",
                transform: "translateX(-50%)",
                width: "calc(100% - 48px)",
                maxWidth: 340,
                zIndex: 10,
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 8px 40px rgba(0,0,0,0.32)",
              }}
            >
              <EventCard event={selected} avatars={selectedAvatars} />
            </div>
          </Link>
        )}

        {selected && venueEvents.length > 1 && (
          /* ── Multi-event venue carousel ───────────────────────────────── */
          <div
            style={{
              position: "absolute",
              bottom: "calc(26px + env(safe-area-inset-bottom, 0px))",
              left: 0,
              right: 0,
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {/* Venue pill header */}
            {selected.venues?.name && (
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    background: "rgba(255,255,255,0.88)",
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#1c1917",
                    boxShadow: "0 1px 6px rgba(0,0,0,0.14)",
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

            {/* Scrollable row of event cards */}
            <div
              className="chip-row"
              style={{
                display: "flex",
                gap: 10,
                overflowX: "auto",
                padding: "0 16px 2px",
              }}
            >
              {venueEvents.map((evt, i) => (
                <Link
                  key={evt.id}
                  href={`/events/${evt.id}`}
                  style={{ textDecoration: "none", color: "inherit", flexShrink: 0 }}
                >
                  <div
                    style={{
                      width: "min(72vw, 230px)",
                      borderRadius: 14,
                      overflow: "hidden",
                      boxShadow: "0 6px 28px rgba(0,0,0,0.30)",
                    }}
                  >
                    <EventCard
                      event={evt}
                      avatars={i === 0 ? selectedAvatars : []}
                    />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filter bottom sheet */}
      {filterOpen && (
        <div
          onClick={(e) => e.target === e.currentTarget && setFilterOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              background: "var(--background)",
              width: "100%",
              borderRadius: "20px 20px 0 0",
              display: "flex",
              flexDirection: "column",
              maxHeight: "85dvh",
            }}
          >
            {/* Fixed header: drag handle + title + X */}
            <div style={{ flexShrink: 0, padding: "12px 20px 0" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 16 }}>
                <span style={{ fontSize: 16, fontWeight: 700 }}>Filters</span>
                <button
                  type="button"
                  onClick={() => setFilterOpen(false)}
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
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Date
              </div>

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
                      className="map-overlay-btn"
                      style={{
                        padding: "7px 14px",
                        borderRadius: 20,
                        border: "none",
                        background: isActive ? "#7c3aed" : "var(--surface-raised)",
                        color: isActive ? "#fff" : "inherit",
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

              {/* Inline calendar — visible when "Pick a date" is active */}
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
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Time
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TIME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTimeFilter(opt.id)}
                    className="map-overlay-btn"
                    style={{
                      padding: "7px 14px",
                      borderRadius: 20,
                      border: "none",
                      background: timeFilter === opt.id ? "#7c3aed" : "var(--surface-raised)",
                      color: timeFilter === opt.id ? "#fff" : "inherit",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Type
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTypeFilter(opt.id)}
                    className="map-overlay-btn"
                    style={{
                      padding: "7px 14px",
                      borderRadius: 20,
                      border: "none",
                      background: typeFilter === opt.id ? "#7c3aed" : "var(--surface-raised)",
                      color: typeFilter === opt.id ? "#fff" : "inherit",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear button — only shown when filters are active */}
            {filterActive && (
              <button
                type="button"
                onClick={() => { setDateFilter("all"); setPickedDate(""); setPickedDateEnd(""); setTimeFilter("all"); setTypeFilter("all"); }}
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
            <div
              style={{
                flexShrink: 0,
                padding: "12px 20px calc(16px + env(safe-area-inset-bottom, 0px))",
                borderTop: "1px solid var(--border-strong)",
                background: "var(--background)",
              }}
            >
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 14,
                  border: "none",
                  background: "#7c3aed",
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  letterSpacing: "-0.01em",
                }}
              >
                Show {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

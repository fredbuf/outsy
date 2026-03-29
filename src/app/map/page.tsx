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

function isInDateWindow(iso: string, window: DateFilter, pickedDate?: string): boolean {
  if (window === "all") return true;
  const now = new Date();
  const d   = new Date(iso);
  const tz  = "America/Toronto";
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: tz });
  const eventStr = d.toLocaleDateString("en-CA",   { timeZone: tz });

  if (window === "pick_date") {
    if (!pickedDate) return true;
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
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [selectedAvatars, setSelectedAvatars] = useState<TileAvatar[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<MapCategory>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [pickedDate, setPickedDate] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const filterActive =
    dateFilter !== "all" || typeFilter !== "all" || timeFilter !== "all";

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
      !searchQuery.trim() &&
      selectedCategory === "all" &&
      dateFilter === "all" &&
      timeFilter === "all" &&
      typeFilter === "all";

    let result = isDefault ? defaultEvents : events;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.venues?.name?.toLowerCase().includes(q) ?? false)
      );
    }

    if (dateFilter !== "all") {
      result = result.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate));
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
  }, [events, defaultEvents, searchQuery, selectedCategory, dateFilter, pickedDate, timeFilter, typeFilter]);

  // All events at the selected venue within the active result set (no dedup).
  // In the default state this uses the same time window as defaultEvents but without
  // venue-dedup so all events at a venue are surfaced in the carousel.
  const venueEvents = useMemo(() => {
    if (!selected) return [];
    const selLat = selected.venues?.lat;
    const selLng = selected.venues?.lng;
    if (typeof selLat !== "number" || typeof selLng !== "number") return [selected];
    const venueKey = `${selLat.toFixed(5)},${selLng.toFixed(5)}`;

    const isDefault =
      !searchQuery.trim() &&
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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        pool = pool.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            (e.venues?.name?.toLowerCase().includes(q) ?? false),
        );
      }
      if (dateFilter !== "all")
        pool = pool.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate));
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
  }, [selected, events, defaultEvents, searchQuery, selectedCategory, dateFilter, pickedDate, timeFilter, typeFilter]);

  // Maps each venue key to the soonest upcoming event at that venue in the
  // active pool — used so marker images always match the first carousel card.
  const venueLeaderMap = useMemo(() => {
    const isDefault =
      !searchQuery.trim() &&
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
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        pool = pool.filter(
          (e) =>
            e.title.toLowerCase().includes(q) ||
            (e.venues?.name?.toLowerCase().includes(q) ?? false),
        );
      }
      if (dateFilter !== "all")
        pool = pool.filter((e) => isInDateWindow(e.start_at, dateFilter, pickedDate));
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
  }, [events, defaultEvents, searchQuery, selectedCategory, dateFilter, pickedDate, timeFilter, typeFilter]);

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

  // Close preview card when the selected event is filtered out
  useEffect(() => {
    if (selected && !filteredEvents.some((e) => e.id === selected.id)) {
      setSelected(null);
    }
  }, [filteredEvents, selected]);

  // Fetch upcoming public events that have venue coordinates
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
      .limit(200)
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

  // Select a suggestion: pan to it, open preview, clear query, hide keyboard
  const handleSuggestionSelect = useCallback((event: MapEvent) => {
    setSuggestionsDismissed(true);
    setSearchQuery("");
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

  // Initialize map — called once by next/script onLoad
  const initMap = useCallback(() => {
    if (!mapDivRef.current) return;

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

  // Place markers whenever events data or map readiness changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsLoaded) return;

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
      const leader   = venueLeaderMap.get(venueKey) ?? event;

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
  }, [filteredEvents, venueLeaderMap, mapsLoaded]);

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
        src={`https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=marker`}
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
                  padding: "0 16px",
                  fontSize: 16,
                  background: "rgba(255,255,255,0.92)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.16)",
                  color: "#1c1917",
                  boxSizing: "border-box",
                }}
              />

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
              padding: "12px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: -8 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.5 }} />
            </div>

            {/* Sheet header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Filters</span>
              <button
                type="button"
                onClick={() => setFilterOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, opacity: 0.45, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            </div>

            {/* Date */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.45, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                Date
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DATE_OPTIONS.map((opt) => {
                  const isPickDate = opt.id === "pick_date";
                  const isActive = dateFilter === opt.id;
                  const label =
                    isPickDate && pickedDate
                      ? new Date(pickedDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : opt.label;

                  if (isPickDate) {
                    // Overlay a transparent <input type="date"> directly on the chip.
                    // The user's tap lands on the native input in the same gesture —
                    // no programmatic showPicker() call needed, so no gesture-context issues.
                    return (
                      <div key={opt.id} style={{ position: "relative", display: "inline-block" }}>
                        <div
                          className="map-overlay-btn"
                          style={{
                            padding: "7px 14px",
                            borderRadius: 20,
                            background: isActive ? "#7c3aed" : "var(--surface-raised)",
                            color: isActive ? "#fff" : "inherit",
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            userSelect: "none",
                          }}
                        >
                          {label}
                        </div>
                        <input
                          ref={dateInputRef}
                          type="date"
                          value={pickedDate}
                          onChange={(e) => {
                            setPickedDate(e.target.value);
                            setDateFilter("pick_date");
                          }}
                          style={{
                            position: "absolute",
                            inset: 0,
                            opacity: 0,
                            cursor: "pointer",
                            width: "100%",
                            height: "100%",
                          }}
                        />
                      </div>
                    );
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
                onClick={() => { setDateFilter("all"); setPickedDate(""); setTimeFilter("all"); setTypeFilter("all"); }}
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
          </div>
        </div>
      )}
    </>
  );
}

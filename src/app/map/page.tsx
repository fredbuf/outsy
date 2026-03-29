/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { BackButton } from "../events/[id]/BackButton";

const MONTREAL = { lat: 45.5017, lng: -73.5673 };
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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

// ── Event marker icons ────────────────────────────────────────────────────────
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

type MapEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
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

export default function MapPage() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const prevSelectedIdRef = useRef<string | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const userPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [selectedAvatars, setSelectedAvatars] = useState<TileAvatar[]>([]);

  // Fetch upcoming public events that have venue coordinates
  useEffect(() => {
    supabaseBrowser()
      .from("events")
      .select("id,title,start_at,image_url,venues(lat,lng,name)")
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

  // Shared helper: store position, pan map, place/update the blue dot
  const placeUserMarker = useCallback((map: google.maps.Map, lat: number, lng: number) => {
    const pos = { lat, lng };
    userPosRef.current = pos;
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
      clickableIcons: false,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_CENTER,
      },
      styles: MAP_STYLES,
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

    events.forEach((event) => {
      const lat = event.venues?.lat;
      const lng = event.venues?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: event.title,
        icon: MARKER_DEFAULT,
        zIndex: 1,
      });

      marker.addListener("click", () => {
        setSelected(event);
        map.panTo({ lat, lng });
      });

      markersRef.current.set(event.id, marker);
    });
  }, [events, mapsLoaded]);

  // Swap marker icon when selected event changes
  useEffect(() => {
    const prevId = prevSelectedIdRef.current;
    const nextId = selected?.id ?? null;
    if (prevId === nextId) return;

    if (prevId) {
      markersRef.current.get(prevId)?.setIcon(MARKER_DEFAULT);
      markersRef.current.get(prevId)?.setZIndex(1);
    }
    if (nextId) {
      markersRef.current.get(nextId)?.setIcon(MARKER_SELECTED);
      markersRef.current.get(nextId)?.setZIndex(10);
    }
    prevSelectedIdRef.current = nextId;
  }, [selected]);

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${API_KEY}`}
        strategy="afterInteractive"
        onLoad={initMap}
      />

      {/* Full-height container below the sticky header */}
      <div style={{ position: "relative", height: "calc(100dvh - 57px)", overflow: "hidden" }}>

        {/* Google Maps canvas */}
        <div ref={mapDivRef} style={{ width: "100%", height: "100%" }} />

        {/* Back button — top-left */}
        <BackButton
          style={{
            position: "absolute",
            top: 16,
            left: 12,
            zIndex: 9,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            background: "#fff",
            boxShadow: "0 2px 10px rgba(0,0,0,0.22)",
            cursor: "pointer",
            color: "#444",
            touchAction: "manipulation",
          }}
        >
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </BackButton>

        {/* Recenter button — shifts up when preview card is visible */}
        {mapsLoaded && (
          <button
            type="button"
            aria-label="Center on my location"
            onClick={handleRecenter}
            style={{
              position: "absolute",
              right: 12,
              bottom: selected ? 240 : 24,
              transition: "bottom 0.2s ease",
              zIndex: 9,
              width: 44,
              height: 44,
              borderRadius: "50%",
              border: "none",
              background: "#fff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.22)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "#444",
              touchAction: "manipulation",
            }}
          >
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L4.5 20.5 L12 17 L19.5 20.5 Z" />
            </svg>
          </button>
        )}

        {/* Event preview card — centered floating tile */}
        {selected && (
          <Link
            href={`/events/${selected.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                left: "50%",
                transform: "translateX(-50%)",
                width: "calc(100% - 48px)",
                maxWidth: 340,
                zIndex: 10,
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 4px 32px rgba(0,0,0,0.26)",
              }}
            >
              {/* Image with gradient overlay */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  paddingBottom: "62%",
                  background: "#1a1020",
                }}
              >
                {selected.image_url && (
                  <img
                    src={selected.image_url}
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
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.1) 75%, transparent 100%)",
                  }}
                />

                {/* Star — top-right */}
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

                {/* Attendee avatars — bottom-right stacked row */}
                {selectedAvatars.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      right: 10,
                      display: "flex",
                      flexDirection: "row-reverse",
                    }}
                  >
                    {selectedAvatars.map((a, i) =>
                      a.url ? (
                        <img
                          key={i}
                          src={a.url}
                          alt=""
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid rgba(0,0,0,0.5)",
                            marginLeft: i > 0 ? -6 : 0,
                          }}
                        />
                      ) : (
                        <div
                          key={i}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: getAvatarColor(a.name),
                            border: "2px solid rgba(0,0,0,0.5)",
                            marginLeft: i > 0 ? -6 : 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            fontWeight: 700,
                            color: "#fff",
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
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: "8px 12px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
                    {formatEventDate(selected.start_at)}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selected.title}
                  </div>
                  {selected.venues?.name && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.55)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {selected.venues.name}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}

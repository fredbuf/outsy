/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";

const MONTREAL = { lat: 45.5017, lng: -73.5673 };
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

type MapEvent = {
  id: string;
  title: string;
  start_at: string;
  image_url: string | null;
  venues: { lat: number | null; lng: number | null; name: string | null } | null;
};

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
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [selected, setSelected] = useState<MapEvent | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

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

  // Initialize map — called once by next/script onLoad
  const initMap = useCallback(() => {
    if (!mapDivRef.current) return;

    const map = new google.maps.Map(mapDivRef.current, {
      zoom: 13,
      center: MONTREAL,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControlOptions: {
        position: google.maps.ControlPosition.RIGHT_CENTER,
      },
    });

    mapRef.current = map;

    // Tapping the map background dismisses the preview card
    map.addListener("click", () => setSelected(null));

    // Pan to user location if permission is granted; fallback stays Montréal
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) =>
        map.panTo({ lat: coords.latitude, lng: coords.longitude }),
      () => {}
    );

    setMapsLoaded(true);
  }, []);

  // Place markers whenever events data or map readiness changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapsLoaded) return;

    // Remove previous markers
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    events.forEach((event) => {
      const lat = event.venues?.lat;
      const lng = event.venues?.lng;
      if (typeof lat !== "number" || typeof lng !== "number") return;

      const marker = new google.maps.Marker({
        map,
        position: { lat, lng },
        title: event.title,
      });

      marker.addListener("click", () => {
        setSelected(event);
        map.panTo({ lat, lng });
      });

      markersRef.current.push(marker);
    });
  }, [events, mapsLoaded]);

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

        {/* Event preview card — slides up from bottom on marker tap */}
        {selected && (
          <Link
            href={`/events/${selected.id}`}
            style={{ textDecoration: "none", color: "inherit" }}
          >
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 10,
                background: "var(--background)",
                borderRadius: "20px 20px 0 0",
                padding: "20px 20px calc(20px + env(safe-area-inset-bottom, 0px))",
                display: "flex",
                gap: 14,
                alignItems: "center",
                boxShadow: "0 -4px 32px rgba(0,0,0,0.14)",
              }}
            >
              {/* Close button */}
              <button
                type="button"
                aria-label="Close preview"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelected(null); }}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 14,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: "none",
                  background: "var(--btn-bg)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "inherit",
                  opacity: 0.6,
                  touchAction: "manipulation",
                }}
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              {/* Thumbnail */}
              {selected.image_url ? (
                <img
                  src={selected.image_url}
                  alt=""
                  width={68}
                  height={68}
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 12,
                    objectFit: "cover",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: 12,
                    background: "var(--surface-raised)",
                    flexShrink: 0,
                  }}
                />
              )}

              {/* Info */}
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selected.title}
                </p>
                <p style={{ fontSize: 13, opacity: 0.6, margin: "4px 0 0" }}>
                  {formatEventDate(selected.start_at)}
                </p>
                {selected.venues?.name && (
                  <p
                    style={{
                      fontSize: 12,
                      opacity: 0.45,
                      margin: "2px 0 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selected.venues.name}
                  </p>
                )}
              </div>

              {/* Chevron hint */}
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.35, flexShrink: 0 }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </Link>
        )}
      </div>
    </>
  );
}

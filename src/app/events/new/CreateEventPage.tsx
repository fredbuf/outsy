/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "../../components/AuthProvider";
import { useActiveOrganizer } from "../../components/ActiveOrganizerContext";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PublicEventSwipePage } from "../[id]/PublicEventSwipePage";
import { PrivateEventSwipePage } from "../[id]/PrivateEventSwipePage";
import { GeneratedAvatar } from "../../components/GeneratedAvatar";

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
type Visibility = "public" | "private";
type OptionSheet = "spots" | "cost" | "rsvp" | null;

type VenueSuggestion = {
  id: string;
  name: string;
  city: string | null;
  address_line1: string | null;
};

type HostProfile = { avatar_url: string | null; display_name: string | null };

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function fmtDateShort(isoDate: string): string {
  const [y, mo, d] = isoDate.split("-").map(Number);
  return new Date(y, mo - 1, d).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}
function fmtTimeShort(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateLine(
  startDate: string, startTime: string, allDay: boolean,
  endDate?: string, endTime?: string, addEndTime?: boolean,
): string {
  if (!startDate) return "";
  const startStr = fmtDateShort(startDate);
  const hasRange = endDate && endDate !== startDate;
  const dateStr = hasRange ? `${startStr} → ${fmtDateShort(endDate!)}` : startStr;
  if (allDay) return `${dateStr} · All day`;
  if (!startTime) return dateStr;
  const tStart = fmtTimeShort(startTime);
  if (addEndTime && endTime) return `${dateStr} · ${tStart}–${fmtTimeShort(endTime)}`;
  return `${dateStr} · ${tStart}`;
}

function toLocalDateStr(iso: string): string {
  // Interpret the UTC ISO string as America/Toronto local time for display.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

function toLocalTimeStr(iso: string): string {
  // Interpret the UTC ISO string as America/Toronto local time for display.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.filter(x => x.type !== "literal").map(x => [x.type, x.value]));
  const h = p.hour === "24" ? "00" : p.hour;
  return `${h}:${p.minute}`;
}

// ── Direct Supabase Storage upload (bypasses Vercel payload limits) ──────────

const STORAGE_BUCKET = "event-images";

/**
 * Compress and resize an image Blob using an off-screen canvas.
 * Caps the longer edge at maxPx, re-encodes as JPEG at the given quality.
 * Falls back to the original blob if canvas is unavailable.
 */
async function compressImage(blob: Blob, maxPx = 1920, quality = 0.85): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(blob); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (result) => resolve(result ?? blob),
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(blob); };
    img.src = url;
  });
}

/**
 * Upload an image directly from the browser to Supabase Storage.
 * Returns the public URL of the uploaded file.
 * Path format: <userId>/<timestamp>-<random8>.<ext>
 */
async function uploadEventImageDirect(
  bytes: Blob,
  mimeType: string,
  userId: string,
): Promise<string> {
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const compressed = await compressImage(bytes);
  const buf = await compressed.arrayBuffer();
  const finalMime = "image/jpeg"; // compressImage always outputs JPEG (unless fallback)
  const actualMime = compressed === bytes ? mimeType : finalMime;
  const actualExt = actualMime === "image/png" ? "png" : actualMime === "image/webp" ? "webp" : ext === "png" || ext === "webp" ? "jpg" : ext;
  const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${actualExt}`;

  const { error } = await supabaseBrowser()
    .storage.from(STORAGE_BUCKET)
    .upload(path, buf, { contentType: actualMime, upsert: false });

  if (error) {
    console.error("[uploadEventImageDirect] storage error:", error.message);
    throw new Error(`Image upload failed: ${error.message}`);
  }

  const { data } = supabaseBrowser().storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─────────────────────────────────────────────────────────────────────────────

function buildPreviewDateLines(startDate: string, startTime: string, allDay: boolean): { dateLine: string; timeLine: string | null } {
  if (!startDate) return { dateLine: "", timeLine: null };
  const [y, m, d] = startDate.split("-").map(Number);
  const dt = allDay || !startTime
    ? new Date(y, m - 1, d)
    : (() => { const [h, min] = startTime.split(":").map(Number); return new Date(y, m - 1, d, h, min); })();
  const dateStr = dt.toLocaleString("en-US", {
    timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric",
  });
  const timeStr = allDay || !startTime ? null : dt.toLocaleString("en-US", {
    timeZone: "America/Toronto", hour: "numeric", minute: "2-digit", hour12: true,
  });
  return { dateLine: dateStr, timeLine: timeStr };
}

export type EditEventData = {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  visibility: "public" | "private";
  category_primary: string;
  source_url: string | null;
  image_url: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  cohost_ids?: string[] | null;
  spots_mode?: string | null;
  spots_limit?: number | null;
  price?: number | null;
  currency?: string | null;
  payment_method?: string | null;
  payment_contact?: string | null;
  rsvp_deadline?: string | null;
  description_title?: string | null;
};

// ── Calendar event thumbnail type ────────────────────────────────────────
type CalEvent = { type: "hosting" | "going" | "interested"; image_url: string | null; title: string };

// ── WheelColumn: single drag-to-scroll column ────────────────────────────
const WHEEL_ITEM_H = 30;   // 30px per row
const WHEEL_VISIBLE = 3;   // only 3 rows visible → 90px total
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE; // 90

function WheelColumn({
  items,
  selectedIndex,
  onSelect,
}: {
  items: string[];
  selectedIndex: number;
  onSelect: (i: number) => void;
}) {
  const [dragDelta, setDragDelta] = useState(0);
  const isDraggingRef = useRef(false);
  const pointerStartY = useRef(0);

  const baseTranslate = WHEEL_H / 2 - WHEEL_ITEM_H / 2 - selectedIndex * WHEEL_ITEM_H;
  const rawTranslate = baseTranslate + dragDelta;
  const minT = WHEEL_H / 2 - WHEEL_ITEM_H / 2 - (items.length - 1) * WHEEL_ITEM_H;
  const maxT = WHEEL_H / 2 - WHEEL_ITEM_H / 2;
  const clampedTranslate = Math.max(minT, Math.min(maxT, rawTranslate));
  const visualIndex = Math.round((WHEEL_H / 2 - WHEEL_ITEM_H / 2 - clampedTranslate) / WHEEL_ITEM_H);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerStartY.current = e.clientY;
    isDraggingRef.current = true;
    setDragDelta(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    setDragDelta(e.clientY - pointerStartY.current);
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    const delta = e.clientY - pointerStartY.current;
    const indexDelta = Math.round(-delta / WHEEL_ITEM_H);
    const newIndex = Math.max(0, Math.min(items.length - 1, selectedIndex + indexDelta));
    onSelect(newIndex);
    setDragDelta(0);
  }
  function onPointerCancel() {
    isDraggingRef.current = false;
    setDragDelta(0);
  }

  return (
    <div
      style={{ flex: 1, position: "relative", overflow: "hidden", height: WHEEL_H, userSelect: "none", cursor: "ns-resize", touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* Selection highlight band */}
      <div style={{ position: "absolute", top: WHEEL_H / 2 - WHEEL_ITEM_H / 2, left: 4, right: 4, height: WHEEL_ITEM_H, background: "rgba(94,168,255,0.10)", borderRadius: 8, pointerEvents: "none", zIndex: 1 }} />
      {/* Top fade */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: WHEEL_H / 2 - WHEEL_ITEM_H / 2, background: "linear-gradient(to bottom, rgba(11,15,20,0.96) 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
      {/* Bottom fade */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: WHEEL_H / 2 - WHEEL_ITEM_H / 2, background: "linear-gradient(to top, rgba(11,15,20,0.96) 0%, transparent 100%)", pointerEvents: "none", zIndex: 2 }} />
      {/* Items */}
      <div style={{ transform: `translateY(${clampedTranslate}px)`, transition: dragDelta !== 0 ? "none" : "transform 0.22s cubic-bezier(0.4,0,0.2,1)", willChange: "transform" }}>
        {items.map((item, i) => {
          const dist = Math.abs(i - visualIndex);
          return (
            <div key={i} style={{
              height: WHEEL_ITEM_H,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: dist === 0 ? 17 : 11,
              fontWeight: dist === 0 ? 700 : 400,
              color: dist === 0 ? "rgba(255,255,255,0.95)" : dist === 1 ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.12)",
              transition: "font-size 0.12s, color 0.12s",
              letterSpacing: dist === 0 ? "-0.02em" : "0",
            }}>
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── WheelTimePicker ───────────────────────────────────────────────────────
const HOUR_ITEMS  = ["12","1","2","3","4","5","6","7","8","9","10","11"];
const MIN_ITEMS   = ["00","15","30","45"];
const PERIOD_ITEMS = ["AM","PM"];

function WheelTimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parsed = value.match(/^(\d{1,2}):(\d{2})$/);
  const h24 = parsed ? parseInt(parsed[1]) : 20;
  const minVal = parsed ? parseInt(parsed[2]) : 0;
  const isPM = h24 >= 12;
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const hourIndex = h12 === 12 ? 0 : h12;
  const minuteIndex = Math.min(3, Math.round(minVal / 15) % 4);
  const periodIndex = isPM ? 1 : 0;

  function buildTime(hIdx: number, mIdx: number, pIdx: number): string {
    const h12v = hIdx === 0 ? 12 : hIdx;
    const m = mIdx * 15;
    const pm = pIdx === 1;
    const h24v = pm ? (h12v === 12 ? 12 : h12v + 12) : (h12v === 12 ? 0 : h12v);
    return `${String(h24v).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  return (
    <div style={{ display: "flex", height: WHEEL_H, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <WheelColumn items={HOUR_ITEMS}   selectedIndex={hourIndex}   onSelect={(i) => onChange(buildTime(i, minuteIndex, periodIndex))} />
      <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
      <WheelColumn items={MIN_ITEMS}    selectedIndex={minuteIndex} onSelect={(i) => onChange(buildTime(hourIndex, i, periodIndex))} />
      <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
      <WheelColumn items={PERIOD_ITEMS} selectedIndex={periodIndex} onSelect={(i) => onChange(buildTime(hourIndex, minuteIndex, i))} />
    </div>
  );
}

// ── DatePickerCalendar ────────────────────────────────────────────────────
const TYPE_ORDER: Record<CalEvent["type"], number> = { hosting: 0, going: 1, interested: 2 };

function DatePickerCalendar({
  start, end, onDayTap, eventDotMap,
}: {
  start: string;
  end: string;
  onDayTap: (iso: string) => void;
  eventDotMap: Record<string, CalEvent[]>;
}) {
  const [year, setYear] = useState(() => {
    const d = start ? new Date(start + "T00:00:00") : new Date();
    return d.getFullYear();
  });
  const [month, setMonth] = useState(() => {
    const d = start ? new Date(start + "T00:00:00") : new Date();
    return d.getMonth();
  });
  const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);

  const calRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchLockedH = useRef(false);

  // Imperative passive:false listener so we can preventDefault on horizontal swipe
  useEffect(() => {
    const el = calRef.current;
    if (!el) return;
    function onTouchMove(e: TouchEvent) {
      if (touchStartX.current === null) return;
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - (touchStartY.current ?? 0);
      if (!touchLockedH.current) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) touchLockedH.current = true;
        else if (Math.abs(dy) > 10) { touchStartX.current = null; return; }
      }
      if (touchLockedH.current) e.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  function goToPrev() {
    setSlideDir("prev");
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function goToNext() {
    setSlideDir("next");
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }
  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchLockedH.current = false;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0);
    touchStartX.current = null;
    touchStartY.current = null;
    touchLockedH.current = false;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) goToNext(); else goToPrev();
  }

  const todayIso = new Date().toLocaleDateString("en-CA");
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...(Array(firstWeekday).fill(null) as null[]),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
    }),
  ];

  const monthKey = year * 12 + month;
  const slideClass = slideDir === "next" ? "cal-slide-next" : slideDir === "prev" ? "cal-slide-prev" : "";
  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const hasRange = Boolean(start && end && end !== start && end > start);
  const rangeBg = "rgba(37,99,235,0.16)";

  return (
    <div ref={calRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={goToPrev} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "rgba(255,255,255,0.65)", padding: "4px 10px", lineHeight: 1 }}>‹</button>
        <span key={`lbl-${monthKey}`} className={slideClass} style={{ display: "inline-block", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{monthLabel}</span>
        <button type="button" onClick={goToNext} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "rgba(255,255,255,0.65)", padding: "4px 10px", lineHeight: 1 }}>›</button>
      </div>
      {/* Weekday labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.38)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      {/* Day grid */}
      <div key={`grid-${monthKey}`} className={slideClass} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e-${i}`} />;
          const isStart = iso === start;
          const isEnd = iso === end;
          const inRange = hasRange && iso > start && iso < end;
          const isToday = iso === todayIso;
          const isPast = iso < todayIso;

          // Pick the single highest-priority event thumbnail
          const dayEvents = (eventDotMap[iso] ?? [])
            .slice()
            .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
          const imgSrc = dayEvents.length > 0 ? dayEvents[0].image_url : null;

          // Half-fill range background on start/end cells
          let bg: string;
          if (inRange) bg = rangeBg;
          else if (isStart && hasRange) bg = `linear-gradient(to right, transparent 50%, ${rangeBg} 50%)`;
          else if (isEnd && hasRange)   bg = `linear-gradient(to left,  transparent 50%, ${rangeBg} 50%)`;
          else bg = "transparent";

          const CIRCLE = 36;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayTap(iso)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2, paddingBottom: 4, border: "none", cursor: "pointer", background: bg }}
            >
              <div style={{
                position: "relative",
                width: CIRCLE, height: CIRCLE, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                background: imgSrc ? "transparent" : isStart || isEnd ? "linear-gradient(135deg, #5EA8FF 0%, #3B82F6 100%)" : "transparent",
                boxShadow: isStart || isEnd ? "0 0 0 2.5px #3B82F6" : "none",
              }}>
                {imgSrc ? (
                  <>
                    <img src={imgSrc} alt="" style={{ width: CIRCLE, height: CIRCLE, objectFit: "cover", borderRadius: "50%", display: "block", opacity: isPast ? 0.45 : 1 }} />
                    <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.44) 100%)", pointerEvents: "none" }} />
                    <span style={{ position: "absolute", fontSize: 12, fontWeight: 700, color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,0.85)", lineHeight: 1 }}>
                      {new Date(iso + "T00:00:00").getDate()}
                    </span>
                    {(isStart || isEnd) && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 0 2.5px #3B82F6", pointerEvents: "none" }} />
                    )}
                  </>
                ) : (
                  <span style={{
                    fontSize: 13,
                    fontWeight: isStart || isEnd || isToday ? 700 : 400,
                    color: isStart || isEnd ? "#fff" : inRange ? "rgba(255,255,255,0.90)" : isPast ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.85)",
                    lineHeight: 1,
                  }}>
                    {new Date(iso + "T00:00:00").getDate()}
                  </span>
                )}
                {isToday && !isStart && !isEnd && !imgSrc && (
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", boxShadow: "inset 0 0 0 1.5px rgba(94,168,255,0.55)", pointerEvents: "none" }} />
                )}
              </div>
            </button>
          );
        })}
      </div>
      {/* Range hint */}
      {start && !end && (
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", textAlign: "center", margin: "8px 0 0" }}>
          Tap a second date to set a range
        </p>
      )}
    </div>
  );
}

// ── RsvpCalendar ─────────────────────────────────────────────────────────────
// Simple single-date picker constrained to [minIso, maxIso].
// Highlights the valid window (today → eventDate) with a subtle fill band.
function RsvpCalendar({
  selected, onSelect, minIso, maxIso,
}: {
  selected: string;
  onSelect: (iso: string) => void;
  minIso: string;       // today — earliest selectable
  maxIso: string | null; // event start date — latest selectable (null = unconstrained)
}) {
  const initDate = selected ? new Date(selected + "T00:00:00") : new Date();
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());
  const [slideDir, setSlideDir] = useState<"prev" | "next" | null>(null);

  const rsvpCalRef = useRef<HTMLDivElement>(null);
  const rsvpTouchStartX = useRef<number | null>(null);
  const rsvpTouchStartY = useRef<number | null>(null);
  const rsvpTouchLockedH = useRef(false);

  useEffect(() => {
    const el = rsvpCalRef.current;
    if (!el) return;
    function onTouchMove(e: TouchEvent) {
      if (rsvpTouchStartX.current === null) return;
      const dx = e.touches[0].clientX - rsvpTouchStartX.current;
      const dy = e.touches[0].clientY - (rsvpTouchStartY.current ?? 0);
      if (!rsvpTouchLockedH.current) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.4) rsvpTouchLockedH.current = true;
        else if (Math.abs(dy) > 10) { rsvpTouchStartX.current = null; return; }
      }
      if (rsvpTouchLockedH.current) e.preventDefault();
    }
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  function goToPrev() {
    setSlideDir("prev");
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function goToNext() {
    setSlideDir("next");
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }
  function onTouchStart(e: React.TouchEvent) {
    rsvpTouchStartX.current = e.touches[0].clientX;
    rsvpTouchStartY.current = e.touches[0].clientY;
    rsvpTouchLockedH.current = false;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (rsvpTouchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - rsvpTouchStartX.current;
    const dy = e.changedTouches[0].clientY - (rsvpTouchStartY.current ?? 0);
    rsvpTouchStartX.current = null;
    rsvpTouchStartY.current = null;
    rsvpTouchLockedH.current = false;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0) goToNext(); else goToPrev();
  }

  const todayIso = new Date().toLocaleDateString("en-CA");
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...(Array(firstWeekday).fill(null) as null[]),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
    ),
  ];

  const monthKey = year * 12 + month;
  const slideClass = slideDir === "next" ? "cal-slide-next" : slideDir === "prev" ? "cal-slide-prev" : "";
  const monthLabel = new Date(year, month, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  // Valid window: today → maxIso (if set)
  const windowEnd = maxIso ?? "";

  return (
    <div ref={rsvpCalRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Month header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={goToPrev} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "rgba(255,255,255,0.65)", padding: "4px 10px", lineHeight: 1 }}>‹</button>
        <span key={`rlbl-${monthKey}`} className={slideClass} style={{ display: "inline-block", fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.92)" }}>{monthLabel}</span>
        <button type="button" onClick={goToNext} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "rgba(255,255,255,0.65)", padding: "4px 10px", lineHeight: 1 }}>›</button>
      </div>
      {/* Weekday labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 2 }}>
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.38)", padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      {/* Day grid */}
      <div key={`rgrid-${monthKey}`} className={slideClass} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {cells.map((iso, i) => {
          if (!iso) return <div key={`re-${i}`} />;

          const isSelected = iso === selected;
          const isToday = iso === todayIso;
          const isTooEarly = iso < minIso;
          const isTooLate = windowEnd ? iso > windowEnd : false;
          const isDisabled = isTooEarly || isTooLate;

          // Highlight the valid RSVP window (today → eventDate, exclusive of endpoints)
          const inWindow = windowEnd && iso > todayIso && iso < windowEnd;
          // Half-fill band on the window boundaries (today = right half, eventDate = left half)
          const isWindowStart = iso === todayIso && windowEnd;
          const isWindowEnd = windowEnd && iso === windowEnd;
          const windowBg = "rgba(94,168,255,0.10)";

          let cellBg = "transparent";
          if (inWindow) cellBg = windowBg;
          else if (isWindowStart) cellBg = `linear-gradient(to right, transparent 50%, ${windowBg} 50%)`;
          else if (isWindowEnd) cellBg = `linear-gradient(to left, transparent 50%, ${windowBg} 50%)`;

          const CIRCLE = 34;
          return (
            <button
              key={iso}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(iso)}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                paddingTop: 2, paddingBottom: 4,
                border: "none", cursor: isDisabled ? "default" : "pointer",
                background: cellBg,
                opacity: isDisabled ? 0.28 : 1,
              }}
            >
              <div style={{
                width: CIRCLE, height: CIRCLE, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: isSelected ? "linear-gradient(135deg, #5EA8FF 0%, #3B82F6 100%)" : "transparent",
                boxShadow: isSelected ? "0 0 0 2.5px #3B82F6" : isToday && !isSelected ? "inset 0 0 0 1.5px rgba(94,168,255,0.55)" : "none",
              }}>
                <span style={{
                  fontSize: 13,
                  fontWeight: isSelected || isToday ? 700 : 400,
                  color: isSelected ? "#fff" : inWindow ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.82)",
                  lineHeight: 1,
                }}>
                  {new Date(iso + "T00:00:00").getDate()}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CreateEventPage({ editData }: { editData?: EditEventData } = {}) {
  const router = useRouter();
  const { user, loading: authLoading, session } = useAuth();
  const { activeOrganizer } = useActiveOrganizer();
  const isEditMode = Boolean(editData);
  const editEventId = editData?.id ?? null;

  const [visibility, setVisibility] = useState<Visibility>(
    () => (editData?.visibility as Visibility) ?? "private"
  );
  const isPrivate = visibility === "private";

  // Core fields
  const [title, setTitle] = useState(() => editData?.title ?? "");
  const [description, setDescription] = useState(() => editData?.description ?? "");
  const [privatePlaceName, setPrivatePlaceName] = useState(() =>
    editData?.visibility === "private" ? (editData?.venue_name ?? "") : ""
  );
  const [privateAddress, setPrivateAddress] = useState(() =>
    editData?.visibility === "private" ? (editData?.venue_address ?? "") : ""
  );
  const [privateLat, setPrivateLat] = useState<number | null>(() => editData?.venue_lat ?? null);
  const [privateLng, setPrivateLng] = useState<number | null>(() => editData?.venue_lng ?? null);
  const [privatePlaceId, setPrivatePlaceId] = useState<string | null>(null);

  const [mapsReady, setMapsReady] = useState(false);
  const [category, setCategory] = useState<Category>(
    () => (editData?.category_primary as Category) ?? "concerts"
  );
  const [sourceUrl, setSourceUrl] = useState(() => editData?.source_url ?? "");
  const [venueName, setVenueName] = useState(() =>
    editData?.visibility !== "private" ? (editData?.venue_name ?? "") : ""
  );
  const [venueAddress, setVenueAddress] = useState(() =>
    editData?.visibility !== "private" ? (editData?.venue_address ?? "") : ""
  );
  const [venueCity, setVenueCity] = useState(() => editData?.venue_city ?? "Montréal");

  // Date / time
  const [startDate, setStartDate] = useState(() =>
    editData?.start_at ? toLocalDateStr(editData.start_at) : ""
  );
  const [startTime, setStartTime] = useState(() =>
    editData?.start_at ? toLocalTimeStr(editData.start_at) : ""
  );
  const [endDate, setEndDate] = useState(() =>
    editData?.end_at ? toLocalDateStr(editData.end_at) : ""
  );
  const [endTime, setEndTime] = useState(() =>
    editData?.end_at ? toLocalTimeStr(editData.end_at) : ""
  );
  const [allDay, setAllDay] = useState(false);
  const [addEndTime, setAddEndTime] = useState(() => Boolean(editData?.end_at));
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [dateClosing, setDateClosing] = useState(false);
  const timezone = "America/Toronto";
  const [eventDotMap, setEventDotMap] = useState<Record<string, CalEvent[]>>({});

  // Image
  // imageFile holds metadata (name, type) for display/validation only.
  // imageBytes holds pre-read bytes so iOS WebKit stale File URLs can't break upload.
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageBytes, setImageBytes] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    () => editData?.image_url ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Host profile
  const [hostProfile, setHostProfile] = useState<HostProfile | null>(null);

  // Venue autocomplete (public events — internal DB)
  const [venueId, setVenueId] = useState<string | null>(() => editData?.venue_id ?? null);
  const [suggestions, setSuggestions] = useState<VenueSuggestion[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privatePlaceNameRef = useRef(privatePlaceName);

  // Google Places predictions (private events — custom UI, no pac-container)
  const [locationQuery, setLocationQuery] = useState("");
  const [placePredictions, setPlacePredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [placesSearching, setPlacesSearching] = useState(false);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesServiceDivRef = useRef<HTMLDivElement>(null);
  const locationQueryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privatePlaceNameInputRef = useRef<HTMLInputElement>(null);
  const locationSearchInputRef = useRef<HTMLInputElement>(null);
  const descriptionTitleInputRef = useRef<HTMLInputElement>(null);

  // Description expand
  const [descriptionOpen, setDescriptionOpen] = useState(() => Boolean(editData?.description));
  const [descriptionTitle, setDescriptionTitle] = useState(() => editData?.description_title ?? "");

  // Photo menu
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

  // Location sheet
  const [locationSheetOpen, setLocationSheetOpen] = useState(false);
  const [locationClosing, setLocationClosing] = useState(false);
  // Tracks the visual viewport height so the sheet never extends above the keyboard
  const [locationSheetVH, setLocationSheetVH] = useState<number | null>(null);
  const [privateAptSuite, setPrivateAptSuite] = useState(() =>
    editData?.visibility === "private" ? "" : ""
  );

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicSubmitted, setPublicSubmitted] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Cohost (private events only) — supports multiple
  type CohostProfile = { id: string; display_name: string | null; username: string | null; avatar_url: string | null };
  const [cohostIds, setCohostIds] = useState<string[]>(() => editData?.cohost_ids ?? []);
  const [cohostProfiles, setCohostProfiles] = useState<CohostProfile[]>([]);
  const [cohostSheetOpen, setCohostSheetOpen] = useState(false);
  const [cohostClosing, setCohostClosing] = useState(false);
  // Draft selection — pending until ✓ is confirmed; X discards without touching cohostIds
  const [cohostDraft, setCohostDraft] = useState<string[]>([]);
  const [cohostFriends, setCohostFriends] = useState<CohostProfile[]>([]);
  const [cohostFriendsLoading, setCohostFriendsLoading] = useState(false);
  const [cohostSearch, setCohostSearch] = useState("");

  // Optional options (private events only)
  const [optionSheet, setOptionSheet] = useState<OptionSheet>(null);
  const [spotsClosing, setSpotsClosing] = useState(false);
  const [spotsMode, setSpotsMode] = useState<"unlimited" | "limited">(() =>
    (editData?.spots_mode as "unlimited" | "limited") ?? "unlimited"
  );
  const [spotsLimit, setSpotsLimit] = useState(() =>
    editData?.spots_limit ? String(editData.spots_limit) : ""
  );
  // Draft state for Spots sheet — pending until ✓ confirmed; X discards
  const [spotsDraftMode, setSpotsDraftMode] = useState<"unlimited" | "limited">("unlimited");
  const [spotsDraftCount, setSpotsDraftCount] = useState(10);
  const [costAmount, setCostAmount] = useState(() =>
    editData?.price ? String(editData.price) : ""
  );
  const [costCurrency, setCostCurrency] = useState<"CAD" | "USD">(() =>
    (editData?.currency as "CAD" | "USD") ?? "CAD"
  );
  const [costPaymentContact, setCostPaymentContact] = useState(() =>
    editData?.payment_contact ?? ""
  );
  // "free" | "paid" | "door" — committed pricing mode
  const [costMode, setCostMode] = useState<"free" | "paid" | "door">(() => {
    if (editData?.payment_method === "door") return "door";
    if (editData?.price && editData.price > 0) return "paid";
    return "free";
  });
  const [costClosing, setCostClosing] = useState(false);
  // Draft state for Cost sheet — pending until ✓ confirmed; X discards
  // costDraftTopMode: top-level Free vs Paid
  // costDraftPayMethod: secondary choice within Paid — "advance" (Interac) vs "door" (pay on site)
  const [costDraftTopMode, setCostDraftTopMode] = useState<"free" | "paid">("free");
  const [costDraftPayMethod, setCostDraftPayMethod] = useState<"advance" | "door">("advance");
  const [costDraftAmount, setCostDraftAmount] = useState("");
  const [costDraftCurrency, setCostDraftCurrency] = useState<"CAD" | "USD">("CAD");
  const [costDraftContact, setCostDraftContact] = useState("");
  const [rsvpDeadline, setRsvpDeadline] = useState(() =>
    editData?.rsvp_deadline ?? ""
  );
  const [rsvpClosing, setRsvpClosing] = useState(false);
  const [rsvpDraft, setRsvpDraft] = useState("");

  // In edit mode, fetch profiles for pre-existing cohosts so they appear in the UI
  useEffect(() => {
    if (!isEditMode || cohostIds.length === 0) return;
    supabaseBrowser()
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .in("id", cohostIds)
      .then(({ data }) => {
        if (data) setCohostProfiles(data as CohostProfile[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode]);

  // Force dark background on html/body so iOS Safari overscroll bounce shows dark, not white
  useEffect(() => {
    const prevHtml = document.documentElement.style.background;
    const prevBody = document.body.style.background;
    document.documentElement.style.background = "#0B0F14";
    document.body.style.background = "#0B0F14";
    return () => {
      document.documentElement.style.background = prevHtml;
      document.body.style.background = prevBody;
    };
  }, []);

  // Lock scroll when any sheet is open
  useEffect(() => {
    document.body.style.overflow = (dateSheetOpen || locationSheetOpen || locationClosing || cohostSheetOpen || cohostClosing || spotsClosing || costClosing || rsvpClosing || optionSheet !== null) ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dateSheetOpen, locationSheetOpen, locationClosing, cohostSheetOpen, cohostClosing, spotsClosing, costClosing, rsvpClosing, optionSheet]);

  // Fetch host profile
  useEffect(() => {
    if (!user) return;
    supabaseBrowser()
      .from("profiles")
      .select("avatar_url,display_name")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setHostProfile(data ?? null));
  }, [user]);

  // If Google Maps was already loaded before this component mounted (e.g. in edit mode
  // after navigating from the event page), the Script onLoad won't fire again.
  // Detect it synchronously on mount so autocomplete can initialize immediately.
  useEffect(() => {
    if (typeof window !== "undefined" && (window as Window & { google?: { maps?: unknown } }).google?.maps) {
      setMapsReady(true);
    }
  }, []);

  // Keep ref in sync so autocomplete closure can read current place name
  useEffect(() => { privatePlaceNameRef.current = privatePlaceName; }, [privatePlaceName]);

  // Initialize AutocompleteService once Maps is loaded
  useEffect(() => {
    if (!mapsReady) return;
    autocompleteServiceRef.current = new google.maps.places.AutocompleteService();
  }, [mapsReady]);

  // Focus the description title field when the description section expands
  useEffect(() => {
    if (descriptionOpen) {
      // setTimeout 0 lets React finish rendering the newly mounted input before focusing
      setTimeout(() => descriptionTitleInputRef.current?.focus(), 0);
    }
  }, [descriptionOpen]);

  // Seed locationQuery from the stored address when the sheet opens, then focus after animation
  useEffect(() => {
    if (locationSheetOpen) {
      setLocationQuery(privateAddress || "");
      setPlacePredictions([]);
      // Delay focus until after the sheet open animation (250ms) to prevent iOS keyboard
      // from firing before the layout is stable, which scrolls the sheet out of view.
      setTimeout(() => locationSearchInputRef.current?.focus(), 350);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationSheetOpen]);

  // Visual viewport height tracking — keeps the sheet capped to what's actually visible
  // when the keyboard opens (vh / dvh are unreliable on iOS for this purpose).
  useEffect(() => {
    if (!locationSheetOpen) { setLocationSheetVH(null); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setLocationSheetVH(vv.height);
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, [locationSheetOpen]);

  // Debounced Google Places predictions
  useEffect(() => {
    if (!locationSheetOpen || !isPrivate) return;
    if (locationQueryDebounceRef.current) clearTimeout(locationQueryDebounceRef.current);
    if (!locationQuery.trim() || !autocompleteServiceRef.current) {
      setPlacePredictions([]);
      return;
    }
    locationQueryDebounceRef.current = setTimeout(() => {
      setPlacesSearching(true);
      autocompleteServiceRef.current!.getPlacePredictions(
        { input: locationQuery },
        (predictions, status) => {
          setPlacesSearching(false);
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
            setPlacePredictions(predictions);
          } else {
            setPlacePredictions([]);
          }
        },
      );
    }, 300);
    return () => {
      if (locationQueryDebounceRef.current) clearTimeout(locationQueryDebounceRef.current);
    };
  }, [locationQuery, locationSheetOpen, isPrivate]);

  // Load friends and seed draft when cohost sheet opens
  useEffect(() => {
    if (!cohostSheetOpen || !session?.access_token) return;
    setCohostDraft(cohostIds);
    setCohostFriendsLoading(true);
    fetch("/api/friends", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => { if (json?.ok) setCohostFriends(json.friends ?? []); })
      .catch(() => {})
      .finally(() => setCohostFriendsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohostSheetOpen, session?.access_token]);

  // (click-outside for venue suggestions handled by the sheet backdrop)

  // Fetch event thumbnails for calendar when sheet opens
  useEffect(() => {
    if (!dateSheetOpen || !user) return;
    const sb = supabaseBrowser();
    async function fetchEvents() {
      type RsvpRow = {
        response: string;
        events: { start_at: string; title: string; image_url: string | null } |
                { start_at: string; title: string; image_url: string | null }[] | null;
      };
      const [{ data: rsvpRows }, { data: hostedRows }] = await Promise.all([
        sb.from("rsvps")
          .select("response, events(start_at, title, image_url)")
          .eq("user_id", user!.id)
          .in("response", ["going", "maybe"]),
        sb.from("events")
          .select("start_at, title, image_url")
          .eq("host_id", user!.id)
          .gte("start_at", new Date().toISOString()),
      ]);
      const map: Record<string, CalEvent[]> = {};
      for (const row of (rsvpRows ?? []) as RsvpRow[]) {
        const ev = Array.isArray(row.events) ? row.events[0] : row.events;
        if (!ev?.start_at) continue;
        const d = ev.start_at.slice(0, 10);
        if (!map[d]) map[d] = [];
        const t: CalEvent["type"] = row.response === "going" ? "going" : "interested";
        map[d].push({ type: t, image_url: ev.image_url, title: ev.title });
      }
      for (const row of ((hostedRows ?? []) as { start_at: string; title: string; image_url: string | null }[])) {
        const d = row.start_at.slice(0, 10);
        if (!map[d]) map[d] = [];
        map[d].push({ type: "hosting", image_url: row.image_url, title: row.title });
      }
      setEventDotMap(map);
    }
    fetchEvents();
  }, [dateSheetOpen, user]);

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function closeDateSheet() {
    setDateClosing(true);
    setTimeout(() => { setDateSheetOpen(false); setDateClosing(false); }, 250);
  }

  function closeLocationSheet() {
    setLocationClosing(true);
    setTimeout(() => { setLocationSheetOpen(false); setLocationClosing(false); }, 250);
  }

  function defaultEndTime(start: string): string {
    if (!start) return "22:00";
    const [h, m] = start.split(":").map(Number);
    const total = (h * 60 + (m || 0) + 120) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function handleDayTap(iso: string) {
    // If no start yet, or a complete range already exists → start fresh
    if (!startDate || (startDate && endDate)) {
      setStartDate(iso);
      setEndDate("");
      return;
    }
    // Have start, no end → set end date
    if (iso === startDate) return; // tap same = stay single day
    if (iso < startDate) {
      setEndDate(startDate);
      setStartDate(iso);
    } else {
      setEndDate(iso);
    }
  }

  function handleImageChange(file: File | null) {
    if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
    if (!file) {
      setImageFile(null);
      setImageBytes(null);
      setImagePreview(null);
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are accepted.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image must be 5 MB or smaller.");
      return;
    }
    setError(null);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    // Eagerly read bytes into memory via FileReader so the in-memory Blob is
    // independent of the File's internal media URL. On iOS WebKit (Safari and
    // Chrome both use WKWebView), the File's internal URL expires after
    // navigation — causing fetch() to throw "The string did not match the
    // expected pattern" when it tries to read the stale reference at upload time.
    const reader = new FileReader();
    reader.onload = () => {
      setImageBytes(new Blob([reader.result as ArrayBuffer], { type: file.type }));
    };
    reader.onerror = () => {
      // Could not read image bytes — clear the selection so the user picks again.
      setImageFile(null);
      setImageBytes(null);
      if (imagePreview && imagePreview.startsWith("blob:")) URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
      setError("Could not read image. Please try selecting it again.");
    };
    reader.readAsArrayBuffer(file);
  }

  function handleVenueNameChange(value: string) {
    setVenueId(null);
    setVenueName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/venues/search?q=${encodeURIComponent(value.trim())}`);
        const json = await res.json();
        const venues: VenueSuggestion[] = json?.venues ?? [];
        setSuggestions(venues);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  function selectVenue(v: VenueSuggestion) {
    setVenueId(v.id);
    setVenueName(v.name);
    setVenueAddress(v.address_line1 ?? venueAddress);
    setVenueCity(v.city ?? venueCity);
    setSuggestions([]);
  }

  function selectPlacePrediction(prediction: google.maps.places.AutocompletePrediction) {
    if (!mapsReady) return;
    if (!placesServiceRef.current) {
      if (placesServiceDivRef.current) {
        placesServiceRef.current = new google.maps.places.PlacesService(placesServiceDivRef.current);
      } else return;
    }
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ["name", "formatted_address", "place_id", "geometry"] },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) return;
        const resolvedAddress = place.formatted_address ?? prediction.description;
        const resolvedName = place.name ?? prediction.structured_formatting.main_text;
        setPrivateLat(place.geometry?.location?.lat() ?? null);
        setPrivateLng(place.geometry?.location?.lng() ?? null);
        setPrivateAddress(resolvedAddress);
        setPrivatePlaceId(place.place_id ?? null);
        // Prefill display name only if the user hasn't typed their own
        if (!privatePlaceNameRef.current.trim()) {
          setPrivatePlaceName(resolvedName);
        }
        // Mirror address in the search bar so it reads as confirmed
        setLocationQuery(resolvedAddress);
        setPlacePredictions([]);
        // Keep the sheet open — focus the display name field so user can review/edit
        setTimeout(() => privatePlaceNameInputRef.current?.focus(), 60);
      },
    );
  }

  const startAt = startDate
    ? `${startDate}T${allDay ? "00:00" : startTime || "00:00"}`
    : "";
  const endAt = (() => {
    if (allDay) return endDate && endDate !== startDate ? `${endDate}T00:00` : "";
    if (addEndTime && startDate) {
      const eDate = endDate && endDate !== startDate ? endDate : startDate;
      return `${eDate}T${endTime || defaultEndTime(startTime)}`;
    }
    return endDate && endDate !== startDate ? `${endDate}T${endTime || "00:00"}` : "";
  })();

  // True once FileReader has finished reading the selected image into memory.
  // Upload must never fall back to the raw File — gate submission until ready.
  const imageBytesReady = !imageFile || imageBytes !== null;
  const canSubmit = Boolean(title.trim() && startDate && imageBytesReady);
  const dateLine = formatDateLine(startDate, startTime, allDay, endDate, endTime, addEndTime);
  const locationLine = isPrivate ? (privatePlaceName || privateAddress) : venueName;

  const fallbackName =
    user?.user_metadata?.full_name ??
    user?.user_metadata?.name ??
    user?.email?.split("@")[0] ??
    "You";
  const displayName = hostProfile?.display_name ?? fallbackName;
  const avatarUrl = hostProfile?.avatar_url ?? null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      let imageUrl: string | null = null;
      if (imageFile) {
        if (!imageBytes) throw new Error("Image not ready. Please wait a moment and try again.");
        if (!user) throw new Error("Sign in to upload images.");
        imageUrl = await uploadEventImageDirect(imageBytes, imageFile.type, user.id);
      } else if (isEditMode && imagePreview?.startsWith("https://")) {
        // Keep existing image when editing without picking a new file
        imageUrl = imagePreview;
      }

      const basePayload = {
        title, description, descriptionTitle: descriptionTitle.trim() || undefined,
        startAt, endAt, visibility, imageUrl,
        ...(activeOrganizer && !isEditMode ? { organizerId: activeOrganizer.organizerId } : {}),
      };
      const payload = isPrivate
        ? {
            ...basePayload,
            category: "concerts",
            venueName: privatePlaceName.trim() || privateAddress.trim() || "",
            venueAddress: [privateAddress.trim(), privateAptSuite.trim()].filter(Boolean).join(", ") || "",
            venueCity: "Montréal",
            venueId: null,
            sourceUrl: null,
            lat: privateLat ?? undefined,
            lng: privateLng ?? undefined,
            placeId: privatePlaceId ?? undefined,
            cohostIds: cohostIds.length > 0 ? cohostIds : undefined,
            spotsMode,
            spotsLimit: spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0
              ? parseInt(spotsLimit)
              : null,
            price: (costMode === "paid" || costMode === "door") && costAmount.trim() && parseFloat(costAmount) > 0
              ? parseFloat(costAmount)
              : null,
            currency: (costMode === "paid" || costMode === "door") && costAmount.trim() && parseFloat(costAmount) > 0 ? costCurrency : null,
            paymentMethod: costMode === "paid" ? "interac" : costMode === "door" ? "door" : null,
            paymentContact: costMode === "paid" && costAmount.trim() && parseFloat(costAmount) > 0
              ? costPaymentContact.trim() || null
              : null,
            rsvpDeadline: rsvpDeadline || null,
          }
        : {
            ...basePayload,
            category,
            venueName,
            venueAddress,
            venueCity,
            venueId: venueId ?? null,
            sourceUrl: sourceUrl.trim() || null,
          };

      const res = await fetch(
        isEditMode ? `/api/events/${editEventId}` : "/api/events/submit",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: { "content-type": "application/json", ...authHeader },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? (isEditMode ? "Could not update event." : "Could not create event."));
      }

      if (isEditMode) {
        // replace so the edit page is removed from history — back goes to what preceded edit
        router.replace(`/events/${editEventId}`);
      } else if (isPrivate) {
        router.push(`/events/${json.eventId}`);
      } else {
        setPublicSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish() {
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);

    try {
      const authHeader: Record<string, string> = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      let imageUrl: string | null = null;
      if (imageFile) {
        if (!imageBytes) throw new Error("Image not ready. Please wait a moment and try again.");
        if (!user) throw new Error("Sign in to upload images.");
        imageUrl = await uploadEventImageDirect(imageBytes, imageFile.type, user.id);
      }

      const basePayload = {
        title, description, descriptionTitle: descriptionTitle.trim() || undefined,
        startAt, endAt, visibility, imageUrl,
        ...(activeOrganizer ? { organizerId: activeOrganizer.organizerId } : {}),
      };
      const payload = isPrivate
        ? {
            ...basePayload,
            category: "concerts",
            venueName: privatePlaceName.trim() || privateAddress.trim() || "",
            venueAddress: [privateAddress.trim(), privateAptSuite.trim()].filter(Boolean).join(", ") || "",
            venueCity: "Montréal",
            venueId: null,
            sourceUrl: null,
            lat: privateLat ?? undefined,
            lng: privateLng ?? undefined,
            placeId: privatePlaceId ?? undefined,
            cohostIds: cohostIds.length > 0 ? cohostIds : undefined,
            spotsMode,
            spotsLimit: spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0
              ? parseInt(spotsLimit)
              : null,
            price: (costMode === "paid" || costMode === "door") && costAmount.trim() && parseFloat(costAmount) > 0
              ? parseFloat(costAmount)
              : null,
            currency: (costMode === "paid" || costMode === "door") && costAmount.trim() && parseFloat(costAmount) > 0 ? costCurrency : null,
            paymentMethod: costMode === "paid" ? "interac" : costMode === "door" ? "door" : null,
            paymentContact: costMode === "paid" && costAmount.trim() && parseFloat(costAmount) > 0
              ? costPaymentContact.trim() || null
              : null,
            rsvpDeadline: rsvpDeadline || null,
          }
        : {
            ...basePayload,
            category,
            venueName,
            venueAddress,
            venueCity,
            venueId: venueId ?? null,
            sourceUrl: sourceUrl.trim() || null,
          };

      const res = await fetch("/api/events/submit", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Could not create event.");
      }

      if (isPrivate) {
        router.push(`/events/${json.eventId}`);
      } else {
        setShowPreview(false);
        setPublicSubmitted(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create event.");
    } finally {
      setSubmitting(false);
    }
  }

  // Auth guard
  if (!authLoading && !user) {
    return (
      <main
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "48px 16px",
          display: "grid",
          gap: 16,
          justifyItems: "start",
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Create an event</h1>
        <p style={{ opacity: 0.6, fontSize: 14, margin: 0 }}>
          Sign in to create and share events.
        </p>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("outsy:open-signin"))}
          style={{
            padding: "10px 20px",
            borderRadius: 10,
            border: "none",
            background: "var(--foreground)",
            color: "var(--background)",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Sign in
        </button>
      </main>
    );
  }

  if (publicSubmitted) {
    return (
      <main
        style={{
          maxWidth: 560,
          margin: "0 auto",
          padding: "48px 16px",
          display: "grid",
          gap: 16,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Event submitted</h1>
        <p style={{ opacity: 0.6, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
          Your event will appear in the public feed once approved.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <Link
            href="/"
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              background: "var(--foreground)",
              color: "var(--background)",
              fontWeight: 600,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Back to events
          </Link>
          <button
            type="button"
            onClick={() => {
              setPublicSubmitted(false);
              setTitle("");
              setDescription("");
              setDescriptionTitle("");
              setStartDate("");
              setStartTime("");
              setEndDate("");
              setEndTime("");
              setAllDay(false);
              setPrivatePlaceName("");
              setPrivateAddress("");
              setPrivateLat(null);
              setPrivateLng(null);
              setPrivatePlaceId(null);
              setCohostIds([]);
              setCohostProfiles([]);
              setSpotsMode("unlimited");
              setSpotsLimit("");
              setCostAmount("");
              setCostCurrency("CAD");
              setCostPaymentContact("");
              setCostMode("free");
              setRsvpDeadline("");
              setVenueName("");
              setVenueAddress("");
              setVenueCity("Montréal");
              setSourceUrl("");
              setImageFile(null);
              setImageBytes(null);
              setImagePreview(null);
            }}
            style={{
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid var(--border-strong)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 14,
              color: "inherit",
            }}
          >
            Submit another
          </button>
        </div>
      </main>
    );
  }

  // ── Preview mode ────────────────────────────────────────────────
  if (showPreview) {
    const { dateLine: previewDateLine, timeLine: previewTimeLine } = buildPreviewDateLines(startDate, startTime, allDay);
    const previewStartAt = startDate
      ? (startTime ? `${startDate}T${startTime}:00` : `${startDate}T00:00:00`)
      : new Date().toISOString();
    // When acting as an organizer, the preview should show the organizer as the
    // primary identity. Pass null for creator and populate organizers instead so
    // PublicEventSwipePage renders the rounded-square logo rather than a personal avatar.
    const previewCreator = activeOrganizer
      ? null
      : { display_name: displayName, avatar_url: avatarUrl, username: null };
    const previewOrganizers = activeOrganizer
      ? [{ name: activeOrganizer.name, role: "organizer", slug: activeOrganizer.slug ?? null, image_url: activeOrganizer.image_url, custom_image_url: activeOrganizer.custom_image_url }]
      : [];
    const previewRsvpCounts = { going: 0, maybe: 0, cant_go: 0 };

    if (isPrivate) {
      const spotsLimited = spotsMode === "limited";
      const spotsLimitNum = spotsLimited && spotsLimit.trim() ? parseInt(spotsLimit) : null;
      const eventPrice = costAmount.trim() && parseFloat(costAmount) > 0 ? parseFloat(costAmount) : null;
      const privateMapHref = privateLat && privateLng
        ? `https://maps.google.com/?q=${privateLat},${privateLng}`
        : null;
      return (
        <PrivateEventSwipePage
          id="preview"
          imageUrl={imagePreview}
          title={title || "Event title"}
          category={category}
          source="preview"
          creatorId={activeOrganizer ? null : (user?.id ?? null)}
          creator={previewCreator}
          organizers={previewOrganizers}
          cohostIds={activeOrganizer ? [] : cohostIds}
          cohostProfiles={activeOrganizer ? [] : cohostProfiles}
          dateLine={previewDateLine}
          timeLine={previewTimeLine}
          privateMapHref={privateMapHref}
          venueName={privatePlaceName || null}
          description={description || null}
          descriptionTitle={descriptionTitle || null}
          spotsLimited={spotsLimited}
          spotsLimit={spotsLimitNum}
          eventPrice={eventPrice}
          eventCurrency={costCurrency}
          paymentMethod={eventPrice ? "interac" : null}
          paymentContact={costPaymentContact.trim() || null}
          rsvpDeadline={rsvpDeadline || null}
          rsvpCounts={previewRsvpCounts}
          attendees={[]}
          guestsCanPost={false}
          guestsCanReact={false}
          initialMoments={[]}
          previewMode
          onPreviewBack={() => setShowPreview(false)}
          onPublish={handlePublish}
          previewSubmitting={submitting}
          previewError={error}
        />
      );
    }

    return (
      <PublicEventSwipePage
        id="preview"
        imageUrl={imagePreview}
        title={title || "Event title"}
        category={category}
        source="preview"
        creatorId={activeOrganizer ? null : (user?.id ?? null)}
        creator={previewCreator}
        organizers={previewOrganizers}
        cohostIds={activeOrganizer ? [] : cohostIds}
        dateLine={previewDateLine}
        timeLine={previewTimeLine}
        mapHref="#"
        venueName={venueName || null}
        description={description || null}
        descriptionTitle={descriptionTitle || null}
        price={null}
        isAnnounced={false}
        rsvpCounts={previewRsvpCounts}
        attendees={[]}
        related={[]}
        sourceUrl={sourceUrl || null}
        guestsCanPost={false}
        guestsCanReact={false}
        initialMoments={[]}
        startAt={previewStartAt}
        previewMode
        onPreviewBack={() => setShowPreview(false)}
        onPublish={handlePublish}
        previewSubmitting={submitting}
        previewError={error}
      />
    );

  }

  const darkVars = {
    color: "#eae8e4",
    "--background":     "rgba(18,25,36,0.55)",
    "--foreground":     "#eae8e4",
    "--border":         "rgba(255,255,255,0.10)",
    "--border-strong":  "rgba(255,255,255,0.18)",
    "--btn-bg":         "rgba(255,255,255,0.07)",
    "--btn-bg-active":  "rgba(255,255,255,0.13)",
    "--surface-subtle": "rgba(255,255,255,0.04)",
    "--surface-raised": "rgba(255,255,255,0.09)",
    "--accent":         "#5EA8FF",
    "--accent-subtle":  "rgba(94,168,255,0.12)",
  } as React.CSSProperties;

  return (
    <>
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""}&libraries=marker,places`}
        strategy="afterInteractive"
        onLoad={() => setMapsReady(true)}
      />

      <style>{`
        .cep-title-b::placeholder { color: rgba(255,255,255,0.38); }
        .cep-desc-b::placeholder { color: rgba(255,255,255,0.38); }
        .cep-options::-webkit-scrollbar { display: none; }
        .cep-loc-row:hover { background: var(--surface-raised) !important; }
        .cep-loc-row:active { opacity: 0.75; }
      `}</style>

      <div style={{ position: "relative", background: "#0B0F14", minHeight: "100dvh", color: "#fff", fontFamily: "Inter, -apple-system, system-ui, sans-serif", ...darkVars }}>
      <form id="cep-form" onSubmit={handleSubmit}>

        {/* ════════════════════════════════════════════════════════════
            IMMERSIVE HERO LAYOUT
            ════════════════════════════════════════════════════════════ */}
        {/* ── Hero image (full-bleed, 360px, absolute) ───────────────── */}
        {/* Filled state: div with onClick opens the photo action sheet */}
        {imagePreview ? (
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: 360, zIndex: 1, overflow: "hidden", cursor: "pointer",
            }}
            onClick={() => setPhotoMenuOpen(true)}
          >
            <img
              src={imagePreview}
              alt="Cover"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
            />
            {/* Bottom fade to page bg */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 180, background: "linear-gradient(180deg, transparent 0%, #0B0F14 90%)", pointerEvents: "none" }} />
            {/* Change cover pill */}
            <div
              style={{
                position: "absolute", top: 108, right: 16, zIndex: 5,
                padding: "11px 16px 11px 13px", borderRadius: 999,
                background: "rgba(0,0,0,0.6)",
                backdropFilter: "blur(20px) saturate(160%)",
                WebkitBackdropFilter: "blur(20px) saturate(160%)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25), 0 6px 20px rgba(0,0,0,0.4)",
                display: "inline-flex", alignItems: "center", gap: 8,
                fontSize: 13.5, fontWeight: 600, color: "#fff", letterSpacing: -0.1,
                pointerEvents: "none",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="14" height="14" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
                <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" />
                <path d="M3 13l3.5-3.5 3 3L13 8l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Change cover
            </div>
          </div>
        ) : (
          /* Empty state: label so tapping anywhere on the hero natively opens the file picker on iOS Safari */
          <label
            htmlFor="cep-file-input"
            style={{
              position: "absolute", top: 0, left: 0, right: 0,
              height: 360, zIndex: 1, overflow: "hidden", cursor: "pointer",
              display: "block",
            }}
          >
            {/* Empty state: blue-grey gradient */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #435C7A 0%, #2a3a52 50%, #0B0F14 100%)" }} />
            {/* Add photo CTA */}
            <div style={{ position: "absolute", top: 130, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ width: 72, height: 72, borderRadius: 999, background: "linear-gradient(180deg, #5EA8FF 0%, #3B82F6 100%)", boxShadow: "0 10px 28px rgba(59,130,246,0.55), inset 0 1px 0 rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="30" height="30" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="2" width="14" height="14" rx="2.5" stroke="white" strokeWidth="1.4" />
                  <circle cx="6.5" cy="6.5" r="1.2" fill="white" />
                  <path d="M3 13l3.5-3.5 3 3L13 8l2.5 2.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>Add a cover photo</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: -4 }}>Sets the mood for your invite</div>
            </div>
            {/* Bottom fade */}
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(180deg, transparent, #0B0F14)", pointerEvents: "none" }} />
          </label>
        )}
        {/* ════════════════════ END HERO ══════════════════════════════ */}

        {/* ── Top bar ─────────────────────────────────────────────── */}
        <div style={{ position: "absolute", top: 56, left: 0, right: 0, padding: "0 16px", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {/* Back button — glass pill */}
          <button
            type="button"
            aria-label="Back"
            onClick={() => window.history.length > 1 ? router.back() : router.push("/events")}
            style={{ width: 36, height: 36, borderRadius: 999, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", border: "none", color: "#fff", flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Visibility pill — segmented Public / Private */}
          <div style={{ display: "inline-flex", padding: 3, borderRadius: 999, background: "rgba(255,255,255,0.06)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }}>
            {(["public", "private"] as const).map((v) => {
              const active = visibility === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, letterSpacing: -0.1, color: active ? "#fff" : "rgba(255,255,255,0.6)", background: active ? "rgba(255,255,255,0.10)" : "transparent", boxShadow: active ? "inset 0 0 0 1px rgba(255,255,255,0.18)" : "none", cursor: "pointer", border: "none", transition: "all 0.18s", fontFamily: "inherit" }}
                >
                  {v === "public" ? (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M1.5 7h11M7 1.5c1.7 1.7 2.5 3.5 2.5 5.5s-.8 3.8-2.5 5.5C5.3 10.8 4.5 9 4.5 7s.8-3.8 2.5-5.5z" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <rect x="2.5" y="6.5" width="9" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M4.5 6.5V4.3a2.5 2.5 0 015 0v2.2" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  )}
                  {v === "public" ? "Public" : "Private"}
                </button>
              );
            })}
          </div>

          {/* Right spacer (preserves symmetry) */}
          <div style={{ width: 36, flexShrink: 0 }} />
        </div>

        {/* ── Scrollable body ──────────────────────────────────────── */}
        <div style={{ position: "relative", zIndex: 2, paddingTop: 300, paddingBottom: 110 }}>

          {/* Title block — centered, over the hero fade */}
          <div style={{ padding: "0 20px 18px", textAlign: "center" }}>
            <input
              required
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="cep-title-b"
              style={{ display: "block", width: "100%", background: "transparent", border: "none", outline: "none", fontSize: 32, fontWeight: 700, lineHeight: 1.1, letterSpacing: -0.2, color: "#fff", textAlign: "center", fontFamily: "inherit", boxSizing: "border-box" }}
            />

            {/* Date row */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setDateSheetOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              >
                <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                  <rect x="1.5" y="2.5" width="11" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.1, color: dateLine ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)" }}>
                  {dateLine || "Date & time"}
                </span>
              </button>
            </div>

            {/* Location row */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setLocationSheetOpen(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}
              >
                <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ color: "rgba(255,255,255,0.85)", flexShrink: 0 }}>
                  <path d="M7 13c3-3.4 4.5-5.8 4.5-7.7A4.5 4.5 0 002.5 5.3C2.5 7.2 4 9.6 7 13z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <circle cx="7" cy="5.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
                </svg>
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.2, letterSpacing: -0.1, color: locationLine ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.38)" }}>
                  {locationLine || "Location"}
                </span>
              </button>
            </div>
          </div>

          {/* Glass content panel — "Add more details" */}
          <div style={{ margin: "20px 12px 0", borderRadius: 26, background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08), 0 20px 60px rgba(0,0,0,0.4)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Section header */}
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, color: "rgba(255,255,255,0.45)", textTransform: "uppercase" as const, padding: "2px 4px 0" }}>
              ADD MORE DETAILS
            </div>

            {/* Chip row */}
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>

              {/* Description chip */}
              {(() => {
                const active = descriptionOpen || !!description;
                const color = active ? "#5EA8FF" : "rgba(255,255,255,0.78)";
                return (
                  <button
                    type="button"
                    onClick={() => setDescriptionOpen(o => !o)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px 8px 11px", borderRadius: 999, background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.05)", boxShadow: `inset 0 0 0 1px ${active ? "rgba(94,168,255,0.38)" : "rgba(255,255,255,0.10)"}`, color, fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1, cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap" as const, border: "none", fontFamily: "inherit" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    Description
                  </button>
                );
              })()}

              {/* Spots chip (private events only) */}
              {isPrivate && (() => {
                const active = spotsMode === "limited" && Boolean(spotsLimit);
                const color = active ? "#5EA8FF" : "rgba(255,255,255,0.78)";
                const label = active && spotsLimit ? `${spotsLimit} spots` : "Spots";
                return (
                  <button
                    type="button"
                    onClick={() => { setSpotsDraftMode(spotsMode); setSpotsDraftCount(spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0 ? parseInt(spotsLimit) : 10); setOptionSheet("spots"); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px 8px 11px", borderRadius: 999, background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.05)", boxShadow: `inset 0 0 0 1px ${active ? "rgba(94,168,255,0.38)" : "rgba(255,255,255,0.10)"}`, color, fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1, cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap" as const, border: "none", fontFamily: "inherit" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <circle cx="5.5" cy="5" r="2.3" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M1.5 12c0-2 1.8-3.4 4-3.4s4 1.4 4 3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      <path d="M9 5.5a2 2 0 100-3M11 11.5c0-1.5-1-2.6-2.4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    {label}
                  </button>
                );
              })()}

              {/* Cost chip (private events only) */}
              {isPrivate && (() => {
                const active = costMode !== "free";
                const color = active ? "#5EA8FF" : "rgba(255,255,255,0.78)";
                const costLabel = costMode === "paid" && costAmount.trim() && parseFloat(costAmount) > 0
                  ? `${costCurrency === "CAD" ? "CA$" : "$"}${costAmount}`
                  : costMode === "door" ? "Pay on site"
                  : "Cost";
                return (
                  <button
                    type="button"
                    onClick={() => { setCostDraftTopMode(costMode === "free" ? "free" : "paid"); setCostDraftPayMethod(costMode === "door" ? "door" : "advance"); setCostDraftAmount(costAmount); setCostDraftCurrency(costCurrency); setCostDraftContact(costPaymentContact); setOptionSheet("cost"); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px 8px 11px", borderRadius: 999, background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.05)", boxShadow: `inset 0 0 0 1px ${active ? "rgba(94,168,255,0.38)" : "rgba(255,255,255,0.10)"}`, color, fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1, cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap" as const, border: "none", fontFamily: "inherit" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <path d="M2 4.5a1 1 0 011-1h8a1 1 0 011 1v1.2a1.3 1.3 0 000 2.6v1.2a1 1 0 01-1 1H3a1 1 0 01-1-1V8.3a1.3 1.3 0 000-2.6V4.5z" stroke="currentColor" strokeWidth="1.3" />
                      <path d="M6 4v6" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1 1.4" />
                    </svg>
                    {costLabel}
                  </button>
                );
              })()}

              {/* RSVP by chip (private events only) */}
              {isPrivate && (() => {
                const active = !!rsvpDeadline;
                const color = active ? "#5EA8FF" : "rgba(255,255,255,0.78)";
                const label = active
                  ? (() => { const [y, m, d] = rsvpDeadline.split("-").map(Number); return `RSVP by ${new Date(y, m - 1, d).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`; })()
                  : "RSVP by";
                return (
                  <button
                    type="button"
                    onClick={() => { setRsvpDraft(rsvpDeadline); setOptionSheet("rsvp"); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 13px 8px 11px", borderRadius: 999, background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.05)", boxShadow: `inset 0 0 0 1px ${active ? "rgba(94,168,255,0.38)" : "rgba(255,255,255,0.10)"}`, color, fontSize: 12.5, fontWeight: 500, letterSpacing: -0.1, cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap" as const, border: "none", fontFamily: "inherit" }}
                  >
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                      <rect x="1.5" y="2.5" width="11" height="10" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    {label}
                  </button>
                );
              })()}

            </div>

            {/* Expanded description field */}
            {(descriptionOpen || !!description) && (
              <div style={{ borderRadius: 14, padding: "10px 14px 12px", background: "rgba(94,168,255,0.05)", boxShadow: "inset 0 0 0 1px rgba(94,168,255,0.22)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ color: "#5EA8FF", flexShrink: 0 }}>
                    <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4, color: "#5EA8FF", textTransform: "uppercase" as const }}>DESCRIPTION</span>
                </div>
                <textarea
                  placeholder="What's the vibe? Who should come?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="cep-desc-b"
                  rows={3}
                  style={{ display: "block", width: "100%", boxSizing: "border-box", background: "transparent", border: "none", outline: "none", fontSize: 13.5, fontWeight: 400, lineHeight: 1.45, color: "#fff", fontFamily: "inherit", resize: "none" }}
                />
              </div>
            )}

            {/* Public-only: category + source URL */}
            {!isPrivate && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", fontSize: 13, background: "rgba(255,255,255,0.05)", color: "#fff", fontFamily: "inherit", outline: "none" }}
                >
                  <option value="concerts">Concerts</option>
                  <option value="nightlife">Nightlife</option>
                  <option value="arts_culture">Arts &amp; Culture</option>
                  <option value="comedy">Comedy</option>
                  <option value="sports">Sports</option>
                  <option value="family">Family</option>
                </select>
                <input
                  placeholder="Tickets / info link"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  style={{ padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", fontSize: 13, background: "rgba(255,255,255,0.05)", color: "#fff", fontFamily: "inherit", outline: "none" }}
                />
              </div>
            )}

          </div>

          {/* Hosted by card */}
          {user && (
            <div style={{ padding: "18px 12px 0" }}>
              <div style={{ borderRadius: 22, padding: "18px 16px 20px", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
                <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: 600, letterSpacing: -0.1, whiteSpace: "nowrap" }}>
                  {isPrivate ? "Hosted by" : "Organized by"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* Host avatar */}
                  {activeOrganizer ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      {activeOrganizer.image_url ? (
                        <img src={activeOrganizer.image_url} alt={activeOrganizer.name} style={{ width: 44, height: 44, borderRadius: 7, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.25)" }} />
                      ) : (
                        <GeneratedAvatar name={activeOrganizer.name} imageUrl={activeOrganizer.custom_image_url} shape="square" size={44} borderRadius={7} initials={activeOrganizer.name.slice(0, 1).toUpperCase()} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>{activeOrganizer.name}</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={displayName} style={{ width: 44, height: 44, borderRadius: 999, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.25)" }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 999, background: "linear-gradient(135deg, #d8b394 0%, #8a5a3b 100%)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.25)", fontSize: 16, fontWeight: 700, color: "#fff" }}>
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>{displayName.split(" ")[0]}</span>
                    </div>
                  )}

                  {/* Cohost avatars */}
                  {cohostProfiles.map((cp) => (
                    <div key={cp.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                      {cp.avatar_url ? (
                        <img src={cp.avatar_url} alt={cp.display_name ?? ""} style={{ width: 44, height: 44, borderRadius: 999, objectFit: "cover", boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,0.25)" }} />
                      ) : (
                        <GeneratedAvatar name={cp.display_name} imageUrl={cp.avatar_url} size={44} />
                      )}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>{(cp.display_name ?? "").split(" ")[0] || "Cohost"}</span>
                    </div>
                  ))}

                  {/* + Cohost dashed slot */}
                  <button
                    type="button"
                    onClick={() => { setCohostSheetOpen(true); setCohostSearch(""); }}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer", background: "none", border: "none", padding: 0, fontFamily: "inherit" }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: 999, border: "1.5px dashed rgba(255,255,255,0.35)", background: "rgba(255,255,255,0.02)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="14" height="14" viewBox="0 0 12 12" fill="none" style={{ color: "rgba(255,255,255,0.7)" }}>
                        <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      </svg>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.55)" }}>Cohost</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 16px 0" }}>{error}</p>}

        </div>

        {/* File input (hidden) — id required for the label htmlFor association */}
        <input
          ref={fileInputRef}
          id="cep-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
        />

      </form>

      {/* ── Preview pill / Save button (fixed, bottom-right) ─────────────
          Rendered OUTSIDE the <form> to guarantee position:fixed is never
          trapped by a form scroll container. Submit button uses form="cep-form"
          to remain associated with the form for native submit. zIndex 200 keeps
          it above the BottomNav (z:150). Bottom uses safe-area-inset-bottom
          so it clears the iOS home indicator.
      ────────────────────────────────────────────────────────────────────── */}
      {isEditMode ? (
        <div style={{ position: "fixed", bottom: "calc(30px + env(safe-area-inset-bottom, 0px))", right: 16, zIndex: 200 }}>
          <button
            type="submit"
            form="cep-form"
            disabled={submitting || !canSubmit}
            style={{ height: 44, padding: "0 22px", borderRadius: 999, background: submitting || !canSubmit ? "rgba(255,255,255,0.15)" : "linear-gradient(180deg, #5EA8FF 0%, #3B82F6 50%, #2563EB 100%)", boxShadow: submitting || !canSubmit ? "none" : "0 8px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)", border: "none", display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", fontSize: 14.5, fontWeight: 600, letterSpacing: -0.1, cursor: submitting || !canSubmit ? "not-allowed" : "pointer", transition: "all 0.2s", fontFamily: "inherit" }}
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : (
        <div style={{ position: "fixed", bottom: "calc(30px + env(safe-area-inset-bottom, 0px))", right: 16, zIndex: 200 }}>
          <button
            type="button"
            onClick={() => { setError(null); setShowPreview(true); }}
            style={{ height: 44, padding: "0 18px", borderRadius: 999, background: "linear-gradient(180deg, #5EA8FF 0%, #3B82F6 50%, #2563EB 100%)", boxShadow: "0 8px 24px rgba(59,130,246,0.5), inset 0 1px 0 rgba(255,255,255,0.25)", border: "none", display: "inline-flex", alignItems: "center", gap: 7, color: "#fff", fontSize: 14.5, fontWeight: 600, letterSpacing: -0.1, cursor: "pointer", transition: "all 0.2s", fontFamily: "inherit" }}
          >
            Preview
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Photo action sheet ──────────────────────────────────────── */}
      {photoMenuOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 400,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "flex-end",
          }}
          onClick={() => setPhotoMenuOpen(false)}
        >
          <div
            style={{
              width: "100%",
              background: "#111110",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(24px, env(safe-area-inset-bottom))",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 32, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.4 }} />
            </div>
            <button
              type="button"
              onClick={() => { setPhotoMenuOpen(false); fileInputRef.current?.click(); }}
              style={{
                display: "block", width: "100%", padding: "16px 20px",
                background: "none", border: "none", borderBottom: "1px solid var(--border)",
                fontSize: 15, fontWeight: 500, cursor: "pointer", color: "inherit",
                textAlign: "left",
              }}
            >
              Change photo
            </button>
            <button
              type="button"
              onClick={() => { setPhotoMenuOpen(false); handleImageChange(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              style={{
                display: "block", width: "100%", padding: "16px 20px",
                background: "none", border: "none",
                fontSize: 15, fontWeight: 500, cursor: "pointer", color: "#dc2626",
                textAlign: "left",
              }}
            >
              Remove photo
            </button>
          </div>
        </div>
      )}

      {/* ── Option sheets (Spots / Cost / RSVP by) ──────────────────── */}

      {/* Spots sheet */}
      {(optionSheet === "spots" || spotsClosing) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setSpotsClosing(true);
            setTimeout(() => { setOptionSheet(null); setSpotsClosing(false); }, 250);
          }}
        >
          <div
            className={spotsClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <button
                type="button"
                onClick={() => {
                  setSpotsClosing(true);
                  setTimeout(() => { setOptionSheet(null); setSpotsClosing(false); }, 250);
                }}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>Spots</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    // Apply draft to committed state
                    setSpotsMode(spotsDraftMode);
                    setSpotsLimit(spotsDraftMode === "limited" ? String(spotsDraftCount) : "");
                    setSpotsClosing(true);
                    setTimeout(() => { setOptionSheet(null); setSpotsClosing(false); }, 250);
                  }}
                  aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "28px 24px 0" }}>

              {/* Helper text */}
              <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.40)", margin: "0 0 28px", letterSpacing: "0.01em" }}>
                How many people can join?
              </p>

              {spotsDraftMode === "unlimited" ? (
                /* Unlimited state — large badge */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 120, height: 64, borderRadius: 20, background: "rgba(94,168,255,0.12)", border: "1.5px solid rgba(94,168,255,0.32)" }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#5EA8FF", letterSpacing: "-0.01em" }}>∞</span>
                  </div>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.42)" }}>No limit on attendees</span>
                </div>
              ) : (
                /* Stepper */
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 32 }}>
                  <button
                    type="button"
                    onClick={() => setSpotsDraftCount((n) => Math.max(1, n - 1))}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", color: "#fff", flexShrink: 0 }}
                    aria-label="Decrease"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                  <div style={{ minWidth: 72, textAlign: "center" }}>
                    <span style={{ fontSize: 44, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>{spotsDraftCount}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSpotsDraftCount((n) => n + 1)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.18)", cursor: "pointer", color: "#fff", flexShrink: 0 }}
                    aria-label="Increase"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  </button>
                </div>
              )}

              {/* Presets */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {([5, 10, 20, 50] as const).map((n) => {
                  const active = spotsDraftMode === "limited" && spotsDraftCount === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => { setSpotsDraftMode("limited"); setSpotsDraftCount(n); }}
                      style={{
                        padding: "7px 18px", borderRadius: 20,
                        background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.07)",
                        border: active ? "1px solid rgba(94,168,255,0.38)" : "1px solid rgba(255,255,255,0.13)",
                        color: active ? "#5EA8FF" : "rgba(255,255,255,0.65)",
                        fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
                {/* Unlimited preset */}
                <button
                  type="button"
                  onClick={() => setSpotsDraftMode("unlimited")}
                  style={{
                    padding: "7px 18px", borderRadius: 20,
                    background: spotsDraftMode === "unlimited" ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.07)",
                    border: spotsDraftMode === "unlimited" ? "1px solid rgba(94,168,255,0.38)" : "1px solid rgba(255,255,255,0.13)",
                    color: spotsDraftMode === "unlimited" ? "#5EA8FF" : "rgba(255,255,255,0.65)",
                    fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Unlimited
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Cost sheet */}
      {(optionSheet === "cost" || costClosing) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setCostClosing(true);
            setTimeout(() => { setOptionSheet(null); setCostClosing(false); }, 250);
          }}
        >
          <div
            className={costClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <button
                type="button"
                onClick={() => {
                  setCostClosing(true);
                  setTimeout(() => { setOptionSheet(null); setCostClosing(false); }, 250);
                }}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>Cost</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    // Apply draft to committed state
                    // top=free → "free"; top=paid+advance → "paid"; top=paid+door → "door"
                    const resolvedMode = costDraftTopMode === "free" ? "free"
                      : costDraftPayMethod === "door" ? "door" : "paid";
                    setCostMode(resolvedMode);
                    setCostAmount(costDraftTopMode === "paid" ? costDraftAmount : "");
                    setCostCurrency(costDraftCurrency);
                    setCostPaymentContact(costDraftTopMode === "paid" && costDraftPayMethod === "advance" ? costDraftContact : "");
                    setCostClosing(true);
                    setTimeout(() => { setOptionSheet(null); setCostClosing(false); }, 250);
                  }}
                  aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 20px 0" }}>

              {/* Helper text */}
              <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.40)", margin: "0 0 20px", letterSpacing: "0.01em" }}>
                How should guests pay?
              </p>

              {/* Top-level: Free / Paid — 2 tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 20 }}>
                {([
                  { id: "free" as const, label: "Free", sub: "No charge" },
                  { id: "paid" as const, label: "Paid", sub: "Set an amount" },
                ]).map(({ id, label, sub }) => {
                  const active = costDraftTopMode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setCostDraftTopMode(id)}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        padding: "14px 8px", borderRadius: 16, cursor: "pointer",
                        background: active ? "rgba(94,168,255,0.12)" : "rgba(255,255,255,0.06)",
                        border: active ? "1.5px solid rgba(94,168,255,0.38)" : "1.5px solid rgba(255,255,255,0.10)",
                        fontFamily: "inherit", gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 15, fontWeight: 700, color: active ? "#5EA8FF" : "#fff" }}>{label}</span>
                      <span style={{ fontSize: 11, color: active ? "rgba(94,168,255,0.75)" : "rgba(255,255,255,0.38)", lineHeight: 1.3 }}>{sub}</span>
                    </button>
                  );
                })}
              </div>

              {/* Secondary + amount — only visible when Paid */}
              {costDraftTopMode === "paid" && (
                <div>
                  {/* Segmented control: Pay in advance / Pay on site */}
                  <div style={{ display: "flex", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", overflow: "hidden", marginBottom: 20 }}>
                    {([
                      { id: "advance" as const, label: "Pay in advance" },
                      { id: "door" as const, label: "Pay on site" },
                    ]).map(({ id, label }) => {
                      const active = costDraftPayMethod === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setCostDraftPayMethod(id)}
                          style={{
                            flex: 1, padding: "10px 8px", border: "none", cursor: "pointer", fontFamily: "inherit",
                            background: active ? "rgba(255,255,255,0.10)" : "transparent",
                            color: active ? "#fff" : "rgba(255,255,255,0.42)",
                            fontSize: 13, fontWeight: active ? 600 : 400,
                            borderRight: id === "advance" ? "1px solid rgba(255,255,255,0.13)" : "none",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Amount input — compact, single unified row */}
                  <div style={{ display: "flex", alignItems: "stretch", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.07)", overflow: "hidden", marginBottom: 10 }}>
                    {/* Currency toggle — left segment */}
                    <div style={{ display: "flex", borderRight: "1px solid rgba(255,255,255,0.12)", flexShrink: 0 }}>
                      {(["CAD", "USD"] as const).map((c, i) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setCostDraftCurrency(c)}
                          style={{
                            padding: "10px 11px", border: "none", cursor: "pointer", fontFamily: "inherit",
                            background: costDraftCurrency === c ? "rgba(255,255,255,0.10)" : "transparent",
                            color: costDraftCurrency === c ? "#fff" : "rgba(255,255,255,0.38)",
                            fontSize: 12, fontWeight: costDraftCurrency === c ? 700 : 500,
                            borderRight: i === 0 ? "1px solid rgba(255,255,255,0.10)" : "none",
                          }}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    {/* Amount input */}
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      placeholder="0.00"
                      value={costDraftAmount}
                      onChange={(e) => setCostDraftAmount(e.target.value)}
                      style={{ flex: 1, background: "none", border: "none", outline: "none", padding: "10px 12px", fontSize: 16, fontWeight: 600, color: "#fff", fontFamily: "inherit" }}
                    />
                  </div>

                  {/* Amount presets */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                    {([10, 20, 30, 50] as const).map((n) => {
                      const active = costDraftAmount === String(n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setCostDraftAmount(String(n))}
                          style={{
                            flex: 1, padding: "7px 0", borderRadius: 20,
                            background: active ? "rgba(94,168,255,0.14)" : "rgba(255,255,255,0.07)",
                            border: active ? "1px solid rgba(94,168,255,0.38)" : "1px solid rgba(255,255,255,0.13)",
                            color: active ? "#5EA8FF" : "rgba(255,255,255,0.65)",
                            fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          }}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>

                  {/* Interac contact — only for Pay in advance */}
                  {costDraftPayMethod === "advance" && (
                    <div style={{ marginBottom: 8 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 8px" }}>
                        Interac e-Transfer to
                      </p>
                      <input
                        type="text"
                        placeholder="Email or phone number"
                        value={costDraftContact}
                        onChange={(e) => setCostDraftContact(e.target.value)}
                        style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                      />
                    </div>
                  )}

                  {/* Pay on site note */}
                  {costDraftPayMethod === "door" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", marginBottom: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
                        Guests pay at the venue. Amount shown is still collected on arrival.
                      </span>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* RSVP by sheet */}
      {(optionSheet === "rsvp" || rsvpClosing) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setRsvpClosing(true);
            setTimeout(() => { setOptionSheet(null); setRsvpClosing(false); }, 250);
          }}
        >
          <div
            className={rsvpClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <button
                type="button"
                onClick={() => {
                  setRsvpClosing(true);
                  setTimeout(() => { setOptionSheet(null); setRsvpClosing(false); }, 250);
                }}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>RSVP by</div>
                {rsvpDraft && (
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
                    {(() => { const [y, m, d] = rsvpDraft.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" }); })()}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setRsvpDeadline(rsvpDraft);
                    setRsvpClosing(true);
                    setTimeout(() => { setOptionSheet(null); setRsvpClosing(false); }, 250);
                  }}
                  aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Calendar body */}
            <div style={{ padding: "16px 20px 0" }}>
              <RsvpCalendar
                selected={rsvpDraft}
                onSelect={setRsvpDraft}
                minIso={new Date().toLocaleDateString("en-CA")}
                maxIso={startDate || null}
              />

              {/* Helper text */}
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", textAlign: "center", margin: "12px 0 0" }}>
                {startDate
                  ? "Pick any date up to your event date"
                  : "Pick a deadline for RSVPs"}
              </p>

              {/* Clear link */}
              {rsvpDraft && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => setRsvpDraft("")}
                    style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "4px 12px" }}
                  >
                    Clear deadline
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Cohost picker sheet ─────────────────────────────────────── */}
      {(cohostSheetOpen || cohostClosing) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            setCohostClosing(true);
            setTimeout(() => { setCohostSheetOpen(false); setCohostClosing(false); }, 250);
          }}
        >
          <div
            className={cohostClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => {
                  setCohostClosing(true);
                  setTimeout(() => { setCohostSheetOpen(false); setCohostClosing(false); }, 250);
                }}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>
                {cohostDraft.length > 0 ? `Co-hosts · ${cohostDraft.length}` : "Add co-host"}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    // Apply draft: update cohostIds and rebuild cohostProfiles from friends list
                    setCohostIds(cohostDraft);
                    setCohostProfiles(cohostFriends.filter((f) => cohostDraft.includes(f.id)));
                    setCohostClosing(true);
                    setTimeout(() => { setCohostSheetOpen(false); setCohostClosing(false); }, 250);
                  }}
                  aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Search — pinned */}
            <div style={{ padding: "14px 16px 0", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 50, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  value={cohostSearch}
                  onChange={(e) => setCohostSearch(e.target.value)}
                  placeholder="Search friends…"
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, color: "#fff", fontFamily: "inherit" }}
                />
                {cohostSearch && (
                  <button
                    type="button"
                    onClick={() => setCohostSearch("")}
                    aria-label="Clear search"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "none", cursor: "pointer", flexShrink: 0, color: "inherit" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
            </div>

            {/* Friend list — scrollable */}
            <div style={{ overflowY: "auto", flex: 1, minHeight: 0, padding: "8px 8px 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
              {cohostFriendsLoading ? (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "32px 20px 0", margin: 0 }}>Loading…</p>
              ) : cohostFriends.length === 0 ? (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "32px 20px 0", margin: 0 }}>No friends yet — add some from your profile.</p>
              ) : (() => {
                const q = cohostSearch.toLowerCase();
                const filtered = cohostFriends.filter((f) => {
                  if (!q) return true;
                  return (f.display_name ?? "").toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q);
                });
                if (filtered.length === 0) return <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "28px 20px 0", margin: 0 }}>No results.</p>;
                return filtered.map((f) => {
                  const selected = cohostDraft.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setCohostDraft((prev) =>
                          prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                        );
                      }}
                      style={{
                        display: "flex", alignItems: "center", gap: 14,
                        width: "100%", padding: "10px 12px",
                        background: selected ? "rgba(94,168,255,0.08)" : "none",
                        border: selected ? "1px solid rgba(94,168,255,0.22)" : "1px solid transparent",
                        borderRadius: 14, cursor: "pointer",
                        color: "inherit", textAlign: "left", fontFamily: "inherit",
                        marginBottom: 4,
                        boxSizing: "border-box",
                      }}
                    >
                      {/* Avatar */}
                      {f.avatar_url ? (
                        <img src={f.avatar_url} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                      ) : (
                        <GeneratedAvatar name={f.display_name} imageUrl={f.avatar_url} size={40} />
                      )}

                      {/* Name + username */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: selected ? "#5EA8FF" : "#fff" }}>
                          {f.display_name ?? `@${f.username}`}
                        </div>
                        {f.username && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 1 }}>@{f.username}</div>}
                      </div>

                      {/* Selection indicator */}
                      <div style={{
                        width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: selected ? "#5EA8FF" : "rgba(255,255,255,0.09)",
                        border: selected ? "none" : "1px solid rgba(255,255,255,0.20)",
                        transition: "background 0.15s, border 0.15s",
                      }}>
                        {selected && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Location sheet ──────────────────────────────────────────── */}
      {/* Hidden attribution node required by PlacesService */}
      <div ref={placesServiceDivRef} aria-hidden style={{ display: "none" }} />

      {(locationSheetOpen || locationClosing) && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && closeLocationSheet()}
        >
          <div
            className={locationClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              // Two-zone layout: top zone is pinned, bottom zone scrolls.
              // maxHeight is driven by the visual viewport so the sheet never overflows
              // above the screen when the keyboard is open (92vh uses the layout viewport
              // which doesn't shrink on iOS, causing the header to disappear upward).
              maxHeight: locationSheetVH ? `${locationSheetVH - 8}px` : "92vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {/* ── Pinned top zone: grab handle + header + search input ── */}
            <div style={{ flexShrink: 0 }}>
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <button
                type="button"
                onClick={closeLocationSheet}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center", fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>Location</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={closeLocationSheet}
                  aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Address search — primary input, always visible */}
            <div style={{ padding: "16px 16px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 14px", height: 50, borderRadius: 14, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.13)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  ref={locationSearchInputRef}
                  placeholder={isPrivate ? "Search for an address or place…" : "Search venues…"}
                  value={isPrivate ? locationQuery : venueName}
                  onChange={(e) => {
                    if (isPrivate) {
                      setLocationQuery(e.target.value);
                      setPrivateLat(null);
                      setPrivateLng(null);
                      setPrivatePlaceId(null);
                    } else {
                      handleVenueNameChange(e.target.value);
                    }
                  }}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 16, color: "#fff", fontFamily: "inherit" }}
                />
                {(isPrivate ? locationQuery : venueName) && (
                  <button
                    type="button"
                    onClick={() => { if (isPrivate) { setLocationQuery(""); setPlacePredictions([]);} else { handleVenueNameChange(""); } }}
                    aria-label="Clear search"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: "rgba(255,255,255,0.14)", border: "none", cursor: "pointer", flexShrink: 0, color: "inherit" }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                )}
              </div>
            </div>
            </div>{/* end pinned top zone */}

            {/* ── Scrollable bottom zone: results + progressive reveal + clear ── */}
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>

            {/* Results list */}
            <div style={{ padding: "8px 8px 0" }}>

              {/* Google Places predictions (private) */}
              {isPrivate && placePredictions.map((pred) => (
                <button
                  key={pred.place_id}
                  type="button"
                  className="cep-loc-row"
                  onClick={() => selectPlacePrediction(pred)}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "inherit", marginBottom: 2 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "rgba(255,255,255,0.38)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pred.structured_formatting.main_text}</div>
                    {pred.structured_formatting.secondary_text && (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pred.structured_formatting.secondary_text}</div>
                    )}
                  </div>
                </button>
              ))}

              {/* Internal venue suggestions (public) */}
              {!isPrivate && suggestions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="cep-loc-row"
                  onClick={() => { selectVenue(v); closeLocationSheet(); }}
                  style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "10px 12px", background: "none", border: "none", borderRadius: 14, cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "inherit", marginBottom: 2 }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "rgba(255,255,255,0.38)" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                    {(v.address_line1 || v.city) && (
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.42)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[v.address_line1, v.city].filter(Boolean).join(", ")}</div>
                    )}
                  </div>
                </button>
              ))}

              {/* Empty state */}
              {isPrivate && !locationQuery.trim() && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "28px 20px 0", margin: 0 }}>
                  Search for a venue, address, or neighbourhood
                </p>
              )}
              {isPrivate && locationQuery.trim() && placePredictions.length === 0 && !placesSearching && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "28px 20px 0", margin: 0 }}>
                  No results — try a different search
                </p>
              )}
              {!isPrivate && !venueName.trim() && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.32)", textAlign: "center", padding: "28px 20px 0", margin: 0 }}>
                  Start typing to search venues
                </p>
              )}
            </div>

            {/* Progressive reveal — shown after an address is confirmed (private) */}
            {isPrivate && privateAddress && (
              <div style={{ padding: "16px 16px 0" }}>
                <div style={{ height: 1, background: "rgba(255,255,255,0.08)", marginBottom: 16 }} />

                {/* Confirmed address pill */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px", marginBottom: 14 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.40)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                  </svg>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{privateAddress}</span>
                  <button
                    type="button"
                    onClick={() => { setPrivateAddress(""); setPrivateLat(null); setPrivateLng(null); setPrivatePlaceId(null); setLocationQuery(""); setPlacePredictions([]);}}
                    aria-label="Clear address"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: "50%", background: "rgba(255,255,255,0.10)", border: "none", cursor: "pointer", flexShrink: 0, color: "rgba(255,255,255,0.60)" }}
                  >
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>

                {/* Display name field */}
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 7px" }}>Display name</p>
                  <input
                    ref={privatePlaceNameInputRef}
                    placeholder="How the venue name appears on your event"
                    value={privatePlaceName}
                    onChange={(e) => { setPrivatePlaceName(e.target.value); privatePlaceNameRef.current = e.target.value; }}
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                  />
                </div>

                {/* Apt / Suite / Floor field */}
                <div style={{ marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 7px" }}>Apt / Suite / Floor <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></p>
                  <input
                    placeholder="e.g. Unit 4B, 3rd floor"
                    value={privateAptSuite}
                    onChange={(e) => setPrivateAptSuite(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.07)", color: "#fff", fontSize: 15, fontFamily: "inherit", outline: "none" }}
                  />
                </div>
              </div>
            )}

            {/* Clear button — visible when a location has been selected */}
            {(isPrivate ? Boolean(privateAddress || privatePlaceName || privateAptSuite) : Boolean(venueName || venueId)) && (
              <div style={{ padding: "20px 16px 0", display: "flex", justifyContent: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    if (isPrivate) {
                      setPrivateAddress("");
                      setPrivatePlaceName("");
                      privatePlaceNameRef.current = "";
                      setPrivateAptSuite("");
                      setPrivateLat(null);
                      setPrivateLng(null);
                      setPrivatePlaceId(null);
                      setLocationQuery("");
                      setPlacePredictions([]);
                    } else {
                      setVenueId(null);
                      setVenueName("");
                      setSuggestions([]);
                    }
                  }}
                  style={{ fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,0.38)", background: "none", border: "none", cursor: "pointer", padding: "6px 16px", fontFamily: "inherit", letterSpacing: "0.01em" }}
                >
                  Clear location
                </button>
              </div>
            )}

            </div>{/* end scrollable bottom zone */}
          </div>
        </div>
      )}

      {/* ── Date / Time bottom sheet ────────────────────────────────── */}
      {dateSheetOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && closeDateSheet()}
        >
          <div
            className={dateClosing ? "filter-sheet-exit" : "filter-sheet-enter"}
            style={{
              width: "100%",
              background: "linear-gradient(180deg, #1c2535 0%, #0b0f14 60%)",
              borderRadius: "22px 22px 0 0",
              maxHeight: "92vh", overflowY: "auto",
              paddingBottom: "max(32px, env(safe-area-inset-bottom))",
            }}
          >
            {/* Grab handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.38)" }} />
            </div>

            {/* Header — 3-column grid */}
            <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center", padding: "10px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <button type="button" onClick={closeDateSheet} aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.13)", cursor: "pointer", color: "rgba(255,255,255,0.78)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#FFFFFF" }}>Date &amp; time</div>
                {dateLine && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{dateLine}</div>}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={closeDateSheet} aria-label="Confirm"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "rgba(94,168,255,0.14)", border: "1px solid rgba(94,168,255,0.28)", cursor: "pointer", color: "#5EA8FF" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ maxWidth: 460, margin: "0 auto" }}>

                {/* Calendar */}
                <DatePickerCalendar
                  start={startDate}
                  end={endDate}
                  onDayTap={handleDayTap}
                  eventDotMap={eventDotMap}
                />

                {/* Progressive disclosure — time controls only after date selected */}
                {startDate && (
                  <>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "20px 0 16px" }} />

                    {/* All-day toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>All day</span>
                      <button
                        type="button"
                        onClick={() => setAllDay(v => !v)}
                        aria-pressed={allDay}
                        style={{ width: 51, height: 31, borderRadius: 16, border: "none", cursor: "pointer", background: allDay ? "linear-gradient(135deg, #5EA8FF 0%, #3B82F6 100%)" : "rgba(255,255,255,0.12)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                      >
                        <span style={{ position: "absolute", top: 4, left: allDay ? 24 : 4, width: 23, height: 23, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "left 0.18s" }} />
                      </button>
                    </div>

                    {/* Time pickers — hidden when all-day */}
                    {!allDay && (
                      <>
                        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0 10px" }} />
                        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 8px" }}>
                          Start time
                        </p>
                        <WheelTimePicker value={startTime || "20:00"} onChange={setStartTime} />

                        {/* Add end time toggle */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 44, marginTop: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>Add end time</span>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !addEndTime;
                              setAddEndTime(next);
                              if (next && !endTime) setEndTime(defaultEndTime(startTime || "20:00"));
                            }}
                            aria-pressed={addEndTime}
                            style={{ width: 51, height: 31, borderRadius: 16, border: "none", cursor: "pointer", background: addEndTime ? "linear-gradient(135deg, #5EA8FF 0%, #3B82F6 100%)" : "rgba(255,255,255,0.12)", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
                          >
                            <span style={{ position: "absolute", top: 4, left: addEndTime ? 24 : 4, width: 23, height: 23, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", transition: "left 0.18s" }} />
                          </button>
                        </div>

                        {/* End time picker */}
                        {addEndTime && (
                          <>
                            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.40)", margin: "0 0 8px" }}>End time</p>
                            <WheelTimePicker
                              value={endTime || defaultEndTime(startTime || "20:00")}
                              onChange={setEndTime}
                            />
                          </>
                        )}
                      </>
                    )}

                    {/* Timezone + Clear */}
                    <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "16px 0 0" }} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, paddingBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                        </svg>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.50)" }}>{timezone}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setStartDate(""); setEndDate(""); setStartTime(""); setEndTime(""); setAllDay(false); setAddEndTime(false); }}
                        style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "rgba(255,255,255,0.50)", fontFamily: "inherit", padding: "5px 12px" }}
                      >
                        Clear
                      </button>
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        </div>
      )}
      </div>{/* end dark wrapper */}
    </>
  );
}

/* eslint-disable @next/next/no-img-element */
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useAuth } from "../../components/AuthProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PublicEventSwipePage } from "../[id]/PublicEventSwipePage";
import { PrivateEventSwipePage } from "../[id]/PrivateEventSwipePage";

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

const AVATAR_COLORS = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1", "#14b8a6",
];

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getAvatarColor(name: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
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

const inputStyle: React.CSSProperties = {
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--border-strong)",
  fontSize: 16,
  background: "transparent",
  color: "inherit",
  width: "100%",
  boxSizing: "border-box",
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

export function CreateEventPage({ editData }: { editData?: EditEventData } = {}) {
  const router = useRouter();
  const { user, loading: authLoading, session } = useAuth();
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
  const [cohostFriends, setCohostFriends] = useState<CohostProfile[]>([]);
  const [cohostFriendsLoading, setCohostFriendsLoading] = useState(false);
  const [cohostSearch, setCohostSearch] = useState("");

  // Optional options (private events only)
  const [optionSheet, setOptionSheet] = useState<OptionSheet>(null);
  const [spotsMode, setSpotsMode] = useState<"unlimited" | "limited">(() =>
    (editData?.spots_mode as "unlimited" | "limited") ?? "unlimited"
  );
  const [spotsLimit, setSpotsLimit] = useState(() =>
    editData?.spots_limit ? String(editData.spots_limit) : ""
  );
  const [costAmount, setCostAmount] = useState(() =>
    editData?.price ? String(editData.price) : ""
  );
  const [costCurrency, setCostCurrency] = useState<"CAD" | "USD">(() =>
    (editData?.currency as "CAD" | "USD") ?? "CAD"
  );
  const [costPaymentContact, setCostPaymentContact] = useState(() =>
    editData?.payment_contact ?? ""
  );
  const [rsvpDeadline, setRsvpDeadline] = useState(() =>
    editData?.rsvp_deadline ?? ""
  );

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

  // Lock scroll when any sheet is open
  useEffect(() => {
    document.body.style.overflow = (dateSheetOpen || locationSheetOpen || locationClosing || cohostSheetOpen || optionSheet !== null) ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [dateSheetOpen, locationSheetOpen, locationClosing, cohostSheetOpen, optionSheet]);

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

  // Load friends when cohost sheet opens
  useEffect(() => {
    if (!cohostSheetOpen || !session?.access_token) return;
    setCohostFriendsLoading(true);
    fetch("/api/friends", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.json())
      .then((json) => { if (json?.ok) setCohostFriends(json.friends ?? []); })
      .catch(() => {})
      .finally(() => setCohostFriendsLoading(false));
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

      const basePayload = { title, description, descriptionTitle: descriptionTitle.trim() || undefined, startAt, endAt, visibility, imageUrl };
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
            price: costAmount.trim() && parseFloat(costAmount) > 0
              ? parseFloat(costAmount)
              : null,
            currency: costAmount.trim() && parseFloat(costAmount) > 0 ? costCurrency : null,
            paymentMethod: costAmount.trim() && parseFloat(costAmount) > 0 ? "interac" : null,
            paymentContact: costAmount.trim() && parseFloat(costAmount) > 0
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

      const basePayload = { title, description, descriptionTitle: descriptionTitle.trim() || undefined, startAt, endAt, visibility, imageUrl };
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
            price: costAmount.trim() && parseFloat(costAmount) > 0
              ? parseFloat(costAmount)
              : null,
            currency: costAmount.trim() && parseFloat(costAmount) > 0 ? costCurrency : null,
            paymentMethod: costAmount.trim() && parseFloat(costAmount) > 0 ? "interac" : null,
            paymentContact: costAmount.trim() && parseFloat(costAmount) > 0
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
    const previewCreator = { display_name: displayName, avatar_url: avatarUrl, username: null };
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
          creatorId={user?.id ?? null}
          creator={previewCreator}
          cohostIds={cohostIds}
          cohostProfiles={cohostProfiles}
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
        creatorId={user?.id ?? null}
        creator={previewCreator}
        cohostIds={cohostIds}
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

  // ── Shared glass styles for on-canvas controls ──────────────────
  const glassCircle: React.CSSProperties = {
    display: "flex", alignItems: "center", justifyContent: "center",
    width: 36, height: 36, borderRadius: "50%",
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", cursor: "pointer", flexShrink: 0, textDecoration: "none",
  };
  const glassPill: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 5,
    padding: "6px 13px", borderRadius: 20,
    background: "rgba(0,0,0,0.30)",
    border: "1px solid rgba(255,255,255,0.16)",
    color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer",
  };

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
        .cep-title::placeholder { color: rgba(255,255,255,0.30); }
        .cep-location::placeholder { color: rgba(255,255,255,0.32); }
        .cep-options::-webkit-scrollbar { display: none; }
        .cep-loc-row:hover { background: var(--surface-raised) !important; }
        .cep-loc-row:active { opacity: 0.75; }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, minHeight: "100dvh", background: "linear-gradient(to bottom, #0b0f14 52%, #243b55 100%)", ...darkVars }}>
      <form onSubmit={handleSubmit}>

        {/* ════════════════════════════════════════════════════════════
            CANVAS — full composition zone
            ════════════════════════════════════════════════════════════ */}
        <div
          style={{
            position: "relative",
            aspectRatio: "9/10",
            borderRadius: "0 0 50px 50px",
            overflow: "hidden",
          }}
        >
          {/* Background image */}
          {imagePreview && (
            <img
              src={imagePreview}
              alt="Cover"
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
              }}
            />
          )}

          {/* Overlay — minimal top scrim always; full hero gradient only with image */}
          <div
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: imagePreview
                // Full event-page treatment: dark top band + heavy bottom gradient
                ? "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, transparent 22%), linear-gradient(to top, rgba(14,8,5,1) 0%, rgba(14,8,5,0.93) 28%, rgba(14,8,5,0.6) 50%, rgba(14,8,5,0.15) 70%, transparent 100%)"
                // No image: just enough to keep the nav bar readable
                : "linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 18%)",
            }}
          />

          {/* ── Nav bar: [back] [toggle] [preview] ───────────────── */}
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
              display: "flex", alignItems: "center", gap: 10,
              padding: "14px 16px",
            }}
          >
            {/* Back — prefer real history; fall back to /events if opened directly */}
            <button
              type="button"
              aria-label="Back"
              style={{ ...glassCircle, width: 39, height: 39 }}
              onClick={() => {
                if (window.history.length > 1) {
                  router.back();
                } else {
                  router.push("/events");
                }
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            {/* Toggle — centered, grows to fill */}
            <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  position: "relative",
                  display: "flex",
                  width: 224, height: 33,
                  background: "rgba(0,0,0,0.18)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  borderRadius: 200,
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {/* Sliding active indicator */}
                <div aria-hidden="true" style={{
                  position: "absolute", top: 0,
                  left: visibility === "public" ? 0 : 112,
                  width: 112, height: 33,
                  background: "rgba(255,255,255,0.07)",
                  borderRadius: 200,
                  transition: "left 0.2s cubic-bezier(0.25,0.46,0.45,0.94)",
                  pointerEvents: "none",
                }} />
                {(["public", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisibility(v)}
                    style={{
                      width: 112, height: 33, border: "none",
                      background: "transparent",
                      color: "#fff",
                      fontSize: 13, fontWeight: 700,
                      cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      position: "relative", zIndex: 1, flexShrink: 0,
                    }}
                  >
                    <img
                      src={v === "public" ? "/Icons/IconPublic.svg" : "/Icons/IconPrivate.svg"}
                      width="13" height="13" alt=""
                      style={{ opacity: 0.9, flexShrink: 0 }}
                    />
                    {v === "public" ? "Public" : "Private"}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer to balance the back button */}
            <div style={{ width: 39, flexShrink: 0 }} />
          </div>

          {/* ── Photo CTA (centered, no-image state only) ─────────── */}
          {!imagePreview && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                position: "absolute", top: "44%", left: "50%",
                transform: "translate(-50%, -50%)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                background: "none", border: "none", cursor: "pointer", zIndex: 5, padding: 0,
              }}
            >
              {/* Liquid glass ellipse */}
              <div style={{
                width: 72, height: 72,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.22)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
              }}>
                <img src="/Icons/IconAddImage.svg" width="29" height="29" alt="" style={{ opacity: 0.85 }} />
              </div>
              <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: "0.01em" }}>Add background image</span>
            </button>
          )}

          {/* Modify photo (when image is set) */}
          {imagePreview && (
            <div style={{ position: "absolute", top: "50%", transform: "translateY(-50%)", left: 0, right: 0, display: "flex", justifyContent: "center", zIndex: 5 }}>
              <button
                type="button"
                onClick={() => setPhotoMenuOpen(true)}
                style={{ ...glassPill, fontSize: 12, padding: "6px 16px" }}
              >
                Modify photo
              </button>
            </div>
          )}

          {/* ── Bottom composition: title · date · location ─────────── */}
          <div
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 5,
              padding: "90px 28px 40px",
              textAlign: "center",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
            }}
          >
            {/* Title */}
            <input
              required
              placeholder="Event title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="cep-title"
              style={{
                width: "100%",
                background: "transparent", border: "none", outline: "none",
                fontSize: 32, fontWeight: 800, lineHeight: 1.15,
                letterSpacing: "-0.02em",
                color: "#fff",
                textAlign: "center",
                fontFamily: "inherit",
              }}
            />

            {/* Date / time row */}
            <button
              type="button"
              onClick={() => setDateSheetOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                color: dateLine ? "rgba(255,255,255,0.72)" : "rgba(255,255,255,0.38)",
                fontSize: 15, fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {dateLine || "Date & time"}
            </button>

            {/* Location row */}
            <button
              type="button"
              onClick={() => setLocationSheetOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "none", border: "none", cursor: "pointer",
                color: locationLine ? "rgba(255,255,255,0.60)" : "rgba(255,255,255,0.38)",
                fontSize: 14, fontWeight: 500,
                fontFamily: "inherit",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6, flexShrink: 0 }}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {locationLine || "Location"}
            </button>
          </div>
        </div>
        {/* ════════════════════ END CANVAS ════════════════════════════ */}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
        />

        {/* ── Lower section ────────────────────────────────────────── */}
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 80px" }}>

          {/* ── Hosted by / Organized by + description card ──────────── */}
          {user && (
            <div
              style={{
                marginTop: 16,
                borderRadius: 20,
                background: "rgba(18,25,36,0.14)",
                border: "1px solid rgba(255,255,255,0.12)",
                overflow: "hidden",
              }}
            >
              {/* Header section — centered */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 16px 0", gap: 10 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#f5f7fa" }}>
                  {isPrivate ? "Hosted by" : "Organized by"}
                </p>
                {/* Host + cohosts avatars row */}
                <div style={{ display: "flex", alignItems: "center" }}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(18,25,36,0.8)", flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(displayName), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", border: "2px solid rgba(18,25,36,0.8)", flexShrink: 0 }}>
                      {getInitials(displayName)}
                    </div>
                  )}
                  {cohostProfiles.map((cp) => (
                    cp.avatar_url ? (
                      <img key={cp.id} src={cp.avatar_url} alt={cp.display_name ?? ""} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(18,25,36,0.8)", marginLeft: -8, flexShrink: 0 }} />
                    ) : (
                      <div key={cp.id} style={{ width: 28, height: 28, borderRadius: "50%", background: getAvatarColor(cp.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", border: "2px solid rgba(18,25,36,0.8)", marginLeft: -8, flexShrink: 0 }}>
                        {getInitials(cp.display_name)}
                      </div>
                    )
                  ))}
                </div>
                {/* + cohost button — available for both public and private */}
                <button
                  type="button"
                  onClick={() => { setCohostSheetOpen(true); setCohostSearch(""); }}
                  style={{
                    height: 19, padding: "0 13px", borderRadius: 10, border: "none",
                    background: "rgba(255,255,255,0.05)",
                    cursor: "pointer", fontSize: 10, fontWeight: 700, color: "#fff",
                    marginBottom: 6, fontFamily: "inherit",
                  }}
                >
                  + cohost
                </button>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "0 16px" }} />

              {/* Description — white button or expanded editor */}
              <div
                onBlur={(e) => {
                  const container = e.currentTarget;
                  if (container.contains(e.relatedTarget as Node | null)) return;
                  setTimeout(() => {
                    if (container.contains(document.activeElement)) return;
                    if (!description && !descriptionTitle) setDescriptionOpen(false);
                  }, 0);
                }}
              >
                {descriptionOpen || description ? (
                  <div style={{ padding: "14px 18px 18px" }}>
                    <input
                      ref={descriptionTitleInputRef}
                      type="text"
                      placeholder="Section title (optional)"
                      value={descriptionTitle}
                      onChange={(e) => setDescriptionTitle(e.target.value)}
                      style={{
                        display: "block", width: "100%", boxSizing: "border-box",
                        padding: "0 0 10px", border: "none",
                        fontSize: 16, fontWeight: 600, textAlign: "center",
                        background: "transparent", color: "inherit",
                        outline: "none", fontFamily: "inherit",
                        borderBottom: "1px solid var(--border)",
                        marginBottom: 10,
                      }}
                    />
                    <textarea
                      placeholder="What's this event about?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={4}
                      style={{
                        display: "block", width: "100%", boxSizing: "border-box",
                        padding: 0, border: "none",
                        fontSize: 16, background: "transparent", color: "inherit",
                        resize: "vertical", outline: "none", textAlign: "center",
                        fontFamily: "inherit", lineHeight: 1.6,
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: "14px 16px 18px", display: "flex", justifyContent: "center" }}>
                    <button
                      type="button"
                      onClick={() => setDescriptionOpen(true)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "85%", height: 33,
                        background: "#ffffff", border: "none", borderRadius: 10,
                        cursor: "pointer", color: "#1f2b39", fontSize: 13, fontWeight: 700,
                        fontFamily: "inherit",
                      }}
                    >
                      Add a description
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Public-only: category + tickets ─────────────────────── */}
          {!isPrivate && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                style={inputStyle}
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
                style={inputStyle}
              />
            </div>
          )}

          {/* ── Options chips (private only) ────────────────────────── */}
          {isPrivate && (() => {
            const spotsLabel = spotsMode === "limited" && spotsLimit.trim() && parseInt(spotsLimit) > 0
              ? `${spotsLimit} spots` : null;
            const costLabel = costAmount.trim() && parseFloat(costAmount) > 0
              ? `${costCurrency === "CAD" ? "CA$" : "$"}${costAmount}` : null;
            const rsvpLabel = rsvpDeadline ? (() => {
              const [y, m, d] = rsvpDeadline.split("-").map(Number);
              return new Date(y, m - 1, d).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
            })() : null;

            const chipBase: React.CSSProperties = {
              display: "flex", alignItems: "center", gap: 5,
              height: 30, padding: "0 12px", borderRadius: 999, flexShrink: 0,
              cursor: "pointer", fontSize: 12, fontWeight: 500,
              color: "#8c98a8", background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.10)",
              fontFamily: "inherit",
            };

            return (
              <div className="cep-options" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "12px 0 2px", scrollbarWidth: "none" }}>
                <button type="button" onClick={() => setOptionSheet("spots")}
                  style={{ ...chipBase, color: spotsLabel ? "#fff" : "#8c98a8", background: spotsLabel ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)" }}>
                  <img src="/Icons/IconSpots.svg" width="14" height="14" alt="" style={{ opacity: 0.7, flexShrink: 0 }} />
                  {spotsLabel ?? "Spots"}
                </button>
                <button type="button" onClick={() => setOptionSheet("cost")}
                  style={{ ...chipBase, color: costLabel ? "#fff" : "#8c98a8", background: costLabel ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)" }}>
                  <img src="/Icons/IconCost.svg" width="14" height="14" alt="" style={{ opacity: 0.7, flexShrink: 0 }} />
                  {costLabel ?? "Cost"}
                </button>
                <button type="button" onClick={() => setOptionSheet("rsvp")}
                  style={{ ...chipBase, color: rsvpLabel ? "#fff" : "#8c98a8", background: rsvpLabel ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)" }}>
                  <img src="/Icons/IconRSVPby.svg" width="13" height="13" alt="" style={{ opacity: 0.7, flexShrink: 0 }} />
                  {rsvpLabel ? `RSVP by ${rsvpLabel}` : "RSVP by"}
                </button>
              </div>
            );
          })()}

          {error && (
            <p style={{ color: "#dc2626", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
          )}

          {/* ── Submit / Preview button ──────────────────────────────── */}
          {isEditMode ? (
            <button
              type="submit"
              disabled={submitting || !canSubmit}
              style={{
                display: "block", width: "100%", marginTop: 20,
                padding: "14px", borderRadius: 12, border: "none",
                fontWeight: 700, fontSize: 15,
                background: submitting || !canSubmit ? "var(--surface-subtle)" : "var(--foreground)",
                color: submitting || !canSubmit ? "inherit" : "var(--background)",
                cursor: submitting || !canSubmit ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          ) : (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, paddingBottom: 16 }}>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => { setError(null); setShowPreview(true); }}
                style={{
                  height: 30, padding: "0 22px",
                  borderRadius: 999,
                  background: !canSubmit ? "rgba(255,255,255,0.35)" : "#ffffff",
                  color: "#435c7a",
                  border: "1px solid rgba(255,255,255,0.10)",
                  fontWeight: 500, fontSize: 12,
                  cursor: !canSubmit ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                Preview
              </button>
              {imageFile && !imageBytesReady && (
                <p style={{ fontSize: 11, opacity: 0.5, margin: "6px 0 0", textAlign: "right" }}>
                  Preparing image…
                </p>
              )}
            </div>
          )}
        </div>
      </form>

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
      {optionSheet === "spots" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Spots</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              {/* Unlimited */}
              <button
                type="button"
                onClick={() => setSpotsMode("unlimited")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 0", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: 15, fontWeight: spotsMode === "unlimited" ? 600 : 400 }}
              >
                <span>Unlimited</span>
                {spotsMode === "unlimited" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
              {/* Limited */}
              <button
                type="button"
                onClick={() => setSpotsMode("limited")}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 0", background: "none", border: "none", borderBottom: spotsMode === "limited" ? "none" : "1px solid var(--border)", cursor: "pointer", color: "inherit", fontFamily: "inherit", fontSize: 15, fontWeight: spotsMode === "limited" ? 600 : 400 }}
              >
                <span>Limited</span>
                {spotsMode === "limited" && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                )}
              </button>
              {spotsMode === "limited" && (
                <div style={{ paddingTop: 14, paddingBottom: 4 }}>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    placeholder="Number of spots"
                    value={spotsLimit}
                    onChange={(e) => setSpotsLimit(e.target.value)}
                    style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                  />
                </div>
              )}
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Cost sheet */}
      {optionSheet === "cost" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>Cost per person</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              {/* Price + currency row */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={costAmount}
                  onChange={(e) => setCostAmount(e.target.value)}
                  style={{ flex: 1, boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                />
                <div style={{ display: "flex", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
                  {(["CAD", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCostCurrency(c)}
                      style={{ padding: "11px 14px", border: "none", background: costCurrency === c ? "var(--surface-raised)" : "transparent", cursor: "pointer", fontSize: 13, fontWeight: costCurrency === c ? 700 : 400, color: "inherit", fontFamily: "inherit" }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              {/* Interac section */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Payment via Interac</span>
                  <span style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: "var(--surface-raised)", opacity: 0.7 }}>Interac</span>
                </div>
                <input
                  type="text"
                  placeholder="Email or phone number"
                  value={costPaymentContact}
                  onChange={(e) => setCostPaymentContact(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
                />
              </div>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* RSVP by sheet */}
      {optionSheet === "rsvp" && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setOptionSheet(null)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", paddingBottom: "max(32px, env(safe-area-inset-bottom))" }}>
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0" }}>
              <button type="button" onClick={() => setOptionSheet(null)} aria-label="Close" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>RSVP by</span>
              <button type="button" onClick={() => setOptionSheet(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}>Done</button>
            </div>
            <div style={{ padding: "20px 20px 0" }}>
              <div style={{ height: 1, background: "var(--border)", marginBottom: 20 }} />
              <input
                type="date"
                value={rsvpDeadline}
                onChange={(e) => setRsvpDeadline(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "inherit", fontSize: 16, fontFamily: "inherit" }}
              />
              {rsvpDeadline && (
                <button
                  type="button"
                  onClick={() => setRsvpDeadline("")}
                  style={{ marginTop: 12, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#ef4444", fontFamily: "inherit", padding: 0 }}
                >
                  Clear deadline
                </button>
              )}
              <button type="button" onClick={() => setOptionSheet(null)} style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "var(--foreground)", color: "var(--background)", fontWeight: 700, fontSize: 15, cursor: "pointer", marginTop: 24 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cohost picker sheet ─────────────────────────────────────── */}
      {cohostSheetOpen && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "flex-end" }}
          onClick={(e) => e.target === e.currentTarget && setCohostSheetOpen(false)}
        >
          <div style={{ width: "100%", background: "#111110", borderRadius: "22px 22px 0 0", maxHeight: "80vh", display: "flex", flexDirection: "column", paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}>
            {/* Drag handle */}
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, flexShrink: 0 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border-strong)", opacity: 0.35 }} />
            </div>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", padding: "12px 20px 0", flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setCohostSheetOpen(false)}
                aria-label="Close"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", background: "var(--btn-bg)", border: "none", cursor: "pointer", color: "inherit", flexShrink: 0 }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 16, fontWeight: 700 }}>
                {cohostIds.length > 0 ? `Co-hosts · ${cohostIds.length}` : "Add co-host"}
              </span>
              <button
                type="button"
                onClick={() => setCohostSheetOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, color: "var(--accent)", padding: "4px 0", flexShrink: 0 }}
              >
                Done
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: "12px 20px 0", flexShrink: 0 }}>
              <input
                value={cohostSearch}
                onChange={(e) => setCohostSearch(e.target.value)}
                placeholder="Search friends…"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border-strong)", fontSize: 16, background: "var(--surface-raised)", color: "inherit", outline: "none", fontFamily: "inherit" }}
              />
            </div>

            {/* Friend list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "8px 20px 0" }}>
              {cohostFriendsLoading ? (
                <p style={{ opacity: 0.45, fontSize: 14, textAlign: "center", padding: "32px 0" }}>Loading…</p>
              ) : cohostFriends.length === 0 ? (
                <p style={{ opacity: 0.45, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No friends yet — add some from your profile.</p>
              ) : (() => {
                const q = cohostSearch.toLowerCase();
                const filtered = cohostFriends.filter((f) => {
                  if (!q) return true;
                  return (f.display_name ?? "").toLowerCase().includes(q) || (f.username ?? "").toLowerCase().includes(q);
                });
                if (filtered.length === 0) return <p style={{ opacity: 0.45, fontSize: 14, padding: "16px 0" }}>No results.</p>;
                return filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      if (cohostIds.includes(f.id)) {
                        setCohostIds((prev) => prev.filter((id) => id !== f.id));
                        setCohostProfiles((prev) => prev.filter((p) => p.id !== f.id));
                      } else {
                        setCohostIds((prev) => [...prev, f.id]);
                        setCohostProfiles((prev) => [...prev, f]);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "10px 0", background: "none", border: "none",
                      borderBottom: "1px solid var(--border)", cursor: "pointer",
                      color: "inherit", textAlign: "left", fontFamily: "inherit",
                    }}
                  >
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: getAvatarColor(f.display_name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, userSelect: "none" }}>
                        {getInitials(f.display_name)}
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.display_name ?? `@${f.username}`}
                      </div>
                      {f.username && <div style={{ fontSize: 12, opacity: 0.45 }}>@{f.username}</div>}
                    </div>
                    {cohostIds.includes(f.id) && (
                      <svg style={{ marginLeft: "auto", flexShrink: 0 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ));
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

/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const PAGE_SIZE = 50;

type Category = "music" | "nightlife" | "art";
type SourceType = "ticketmaster" | "manual";

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

type DateWindow = "all" | "today" | "this_week" | "weekend";
type PriceFilter = "all" | "free" | "paid";

// Returns the UTC ISO string for 00:00:00 on the given YYYY-MM-DD in Montreal.
function montrealDayStart(dateStr: string): string {
  // Strategy: at noon UTC, ask Intl what hour it is in Montreal, then subtract
  // that many hours from noon to land on midnight Montreal.
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

// Returns the UTC ISO string for 23:59:59.999 on the given YYYY-MM-DD in Montreal.
// Correctly handles DST days (e.g. spring-forward = 23h day).
function montrealDayEnd(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  // Advance one calendar day (handles month/year rollover via UTC)
  const nextDayUtc = new Date(Date.UTC(year, month - 1, day + 1));
  const nextDateStr = nextDayUtc.toISOString().slice(0, 10);
  return new Date(new Date(montrealDayStart(nextDateStr)).getTime() - 1).toISOString();
}

function buildPageQuery(
  supabase: ReturnType<typeof supabaseBrowser>,
  pageIndex: number,
  fromDate: string,
  toDate: string
) {
  const rangeFrom = pageIndex * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  // Safety filters applied on every query — matches policy enforced on insert.
  let q = supabase
    .from("events")
    .select(
      "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url"
    )
    .eq("city_normalized", "montreal")
    .eq("status", "scheduled")
    .eq("is_approved", true)
    .eq("is_rejected", false);

  if (fromDate) {
    q = q.gte("start_at", montrealDayStart(fromDate));
  } else {
    // Default: only future events
    q = q.gte("start_at", new Date().toISOString());
  }

  if (toDate) {
    q = q.lte("start_at", montrealDayEnd(toDate));
  }

  return q.order("start_at", { ascending: true }).range(rangeFrom, rangeTo);
}

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

function matchesPriceFilter(event: EventRow, filter: PriceFilter) {
  if (filter === "all") return true;
  const { min_price: minPrice, max_price: maxPrice } = event;
  const hasPrice = minPrice !== null || maxPrice !== null;
  if (filter === "free") return !hasPrice || minPrice === 0 || maxPrice === 0;
  return hasPrice && (minPrice === null || minPrice > 0 || maxPrice === null || maxPrice > 0);
}

export function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  // nextPage: the page index to request on the next "Load more" click.
  const [nextPage, setNextPage] = useState(1);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Client-side filters
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  // Server-side date range (YYYY-MM-DD strings from <input type="date">)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const hasCustomRange = fromDate !== "" || toDate !== "";

  // Incremented on every filter-triggered reset to discard stale fetches.
  const genRef = useRef(0);

  // Reset + fetch page 0 whenever the server-side date filters change.
  useEffect(() => {
    const gen = ++genRef.current;

    const run = async () => {
      setLoading(true);
      setEvents([]);
      setExhausted(false);
      setNextPage(1);

      const { data, error } = await buildPageQuery(supabaseBrowser(), 0, fromDate, toDate);
      if (gen !== genRef.current) return; // stale — a newer filter change fired
      if (error) console.error(error);
      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      if (rows.length < PAGE_SIZE) setExhausted(true);
      setLoading(false);
    };

    run();
  }, [fromDate, toDate]);

  async function handleLoadMore() {
    setLoadingMore(true);
    const { data, error } = await buildPageQuery(
      supabaseBrowser(),
      nextPage,
      fromDate,
      toDate
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

  // Client-side filter applied to all loaded events.
  // The date window preset is ignored when a custom range is active (server handles it).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (category !== "all" && e.category_primary !== category) return false;
      if (source !== "all" && e.source !== source) return false;
      if (!hasCustomRange && !isInDateWindow(e.start_at, dateWindow)) return false;
      if (!matchesPriceFilter(e, priceFilter)) return false;
      if (!q) return true;
      return `${e.title} ${e.description ?? ""}`.toLowerCase().includes(q);
    });
  }, [events, query, category, source, dateWindow, priceFilter, hasCustomRange]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
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

          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
            style={{ padding: "8px 10px", borderRadius: 8 }}
          >
            <option value="all">Any price</option>
            <option value="free">Free</option>
            <option value="paid">Paid</option>
          </select>

          <span style={{ marginLeft: "auto", opacity: 0.7, fontSize: 14 }}>
            {loading ? "Loading…" : `${filtered.length} event${filtered.length !== 1 ? "s" : ""}${!exhausted ? "+" : ""}`}
          </span>
        </div>

        {/* Row 2: custom date range */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, opacity: 0.7 }}>From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.2)" }}
          />
          <label style={{ fontSize: 13, opacity: 0.7 }}>To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.2)" }}
          />
          {hasCustomRange && (
            <button
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
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

      {loading ? (
        <p>Loading events…</p>
      ) : filtered.length === 0 ? (
        <p>No events found.</p>
      ) : (
        filtered.map((e) => (
          <article
            key={e.id}
            style={{
              border: "1px solid rgba(0,0,0,0.12)",
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
                  background: "rgba(0,0,0,0.06)",
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
                {e.category_primary} • {e.source === "manual" ? "community" : "ticketmaster"}
              </div>
            </div>

            {e.source_url ? (
              <a
                href={e.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: "auto", fontWeight: 600 }}
              >
                Details →
              </a>
            ) : null}
          </article>
        ))
      )}

      {/* Load more */}
      {!loading && (
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
                border: "1px solid rgba(0,0,0,0.2)",
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

/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
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

  if (window === "today") {
    return d.toDateString() === now.toDateString();
  }

  if (window === "this_week") {
    const start = new Date(now);
    const day = start.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    return d >= start && d < end;
  }

  const startWeekend = new Date(now);
  const daysUntilFriday = (5 - startWeekend.getDay() + 7) % 7;
  startWeekend.setDate(startWeekend.getDate() + daysUntilFriday);
  startWeekend.setHours(0, 0, 0, 0);

  const endWeekend = new Date(startWeekend);
  endWeekend.setDate(endWeekend.getDate() + 3);

  return d >= startWeekend && d < endWeekend;
}

function matchesPriceFilter(event: EventRow, filter: PriceFilter) {
  if (filter === "all") return true;

  const minPrice = event.min_price;
  const maxPrice = event.max_price;
  const hasPrice = minPrice !== null || maxPrice !== null;

  if (filter === "free") {
    return !hasPrice || minPrice === 0 || maxPrice === 0;
  }

  return hasPrice && (minPrice === null || minPrice > 0 || maxPrice === null || maxPrice > 0);
}

export function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [source, setSource] = useState<SourceType | "all">("all");
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const supabase = supabaseBrowser();

      const { data, error } = await supabase
        .from("events")
        .select(
          "id,title,description,start_at,category_primary,source,min_price,max_price,image_url,source_url"
        )
        .eq("city_normalized", "montreal")
        .eq("status", "scheduled")
        .eq("is_approved", true)
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(300);

      if (error) console.error(error);
      setEvents((data ?? []) as EventRow[]);
      setLoading(false);
    };

    run();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return events.filter((e) => {
      if (category !== "all" && e.category_primary !== category) return false;
      if (source !== "all" && e.source !== source) return false;
      if (!isInDateWindow(e.start_at, dateWindow)) return false;
      if (!matchesPriceFilter(e, priceFilter)) return false;

      if (!q) return true;
      const searchable = `${e.title} ${e.description ?? ""}`.toLowerCase();
      return searchable.includes(q);
    });
  }, [events, query, category, source, dateWindow, priceFilter]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search events"
          style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.2)" }}
        />

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
            value={dateWindow}
            onChange={(e) => setDateWindow(e.target.value as DateWindow)}
            style={{ padding: "8px 10px", borderRadius: 8 }}
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

          <span style={{ marginLeft: "auto", opacity: 0.7 }}>
            {loading ? "Loading..." : `${filtered.length} events`}
          </span>
        </div>
      </div>

      {loading ? (
        <p>Loading events...</p>
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
    </div>
  );
}

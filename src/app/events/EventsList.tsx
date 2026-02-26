"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Category = "music" | "nightlife" | "art";

type EventRow = {
  id: string;
  title: string;
  start_at: string;
  category_primary: Category;
  image_url: string | null;
  source_url: string | null;
};

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

export function EventsList() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<Category | "all">("all");

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      const supabase = supabaseBrowser();

      const q = supabase
        .from("events")
        .select("id,title,start_at,category_primary,image_url,source_url")
        .eq("city_normalized", "montreal")
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(200);

      const { data, error } = await q;

      if (error) console.error(error);
      setEvents((data ?? []) as EventRow[]);
      setLoading(false);
    };

    run();
  }, []);

  const filtered = useMemo(() => {
    if (category === "all") return events;
    return events.filter((e) => e.category_primary === category);
  }, [events, category]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontWeight: 600 }}>Category:</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as any)}
          style={{ padding: "8px 10px", borderRadius: 8 }}
        >
          <option value="all">All</option>
          <option value="music">Music</option>
          <option value="nightlife">Nightlife</option>
          <option value="art">Art</option>
        </select>
        <span style={{ marginLeft: "auto", opacity: 0.7 }}>
          {loading ? "Loading…" : `${filtered.length} events`}
        </span>
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
                {e.category_primary}
              </div>
            </div>

            {e.source_url ? (
              <a
                href={e.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: "auto", fontWeight: 600 }}
              >
                Tickets →
              </a>
            ) : null}
          </article>
        ))
      )}
    </div>
  );
}
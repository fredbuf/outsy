import "server-only";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { tonightBoundsIso } from "@/lib/tonight-bounds";
import { CategoryEventsPage } from "./CategoryEventsPage";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CategoryEventRow = {
  id: string;
  title: string;
  start_at: string;
  category_primary: string;
  image_url: string | null;
  source_url: string | null;
  min_price: number | null;
  venues: { name: string; city: string | null } | null;
};

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { title: string }> = {
  "this-week":          { title: "This Week" },
  "happening-tonight":  { title: "Happening Tonight" },
};

// ── Date helpers (server-side, America/Toronto) ───────────────────────────────

function toTorontoDateStr(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
}

function torontoLocalToUtcMs(dateStr: string, hour: number): number {
  const tz = "America/Toronto";
  const approx = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`);
  const localStr = approx.toLocaleString("en-CA", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const [datePart, timePart] = localStr.split(", ");
  const utcGuess = new Date(`${datePart}T${timePart}Z`);
  const offsetMs = approx.getTime() - utcGuess.getTime();
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`).getTime() + offsetMs;
}

function thisWeekBounds(now: Date): { start: string; end: string } {
  const todayStr = toTorontoDateStr(now);
  const dayName = now.toLocaleDateString("en-US", { timeZone: "America/Toronto", weekday: "short" });
  const offsets: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const daysFromMonday = offsets[dayName] ?? 0;
  const [y, m, d] = todayStr.split("-").map(Number);

  // Start of today in Toronto (midnight)
  const startMs = torontoLocalToUtcMs(todayStr, 0);

  // Next Monday midnight
  const nextMondayDate = new Date(Date.UTC(y, m - 1, d - daysFromMonday + 7));
  const nextMondayStr = nextMondayDate.toISOString().slice(0, 10);
  const endMs = torontoLocalToUtcMs(nextMondayStr, 0);

  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchCategoryEvents(slug: string): Promise<CategoryEventRow[]> {
  const now = new Date();
  const supabase = supabaseServer();

  let startAt: string;
  let endAt: string;

  if (slug === "this-week") {
    const bounds = thisWeekBounds(now);
    startAt = bounds.start;
    endAt = bounds.end;
  } else if (slug === "happening-tonight") {
    // Use the shared helper — same logic as the Home category preview.
    // No grace cutoff applied here: See All shows every event in the tonight
    // window (5 PM → 3 AM) regardless of whether it has already started.
    // The 1-hour grace on Home is a feed-freshness detail, not a page rule.
    const bounds = tonightBoundsIso(now);
    startAt = bounds.windowStart;
    endAt = bounds.windowEnd;
  } else {
    return [];
  }

  const { data, error } = await supabase
    .from("events")
    .select("id,title,start_at,category_primary,image_url,source_url,min_price,venues(name,city)")
    .eq("is_approved", true)
    .eq("is_rejected", false)
    .eq("visibility", "public")
    .gte("start_at", startAt)
    .lt("start_at", endAt)
    .order("start_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[category/page] fetch error:", error.message);
    return [];
  }
  return (data ?? []) as unknown as CategoryEventRow[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const config = CATEGORY_CONFIG[slug];
  if (!config) notFound();

  const events = await fetchCategoryEvents(slug);

  return (
    <CategoryEventsPage
      title={config.title}
      events={events}
    />
  );
}

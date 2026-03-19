import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue } from "@/lib/ingestion-shared";

type Category = "music" | "nightlife" | "art";
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 2000;
const VENUE_NAME_MAX = 120;
const VENUE_ADDRESS_MAX = 180;
const CITY_MAX = 80;
const URL_MAX = 500;
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;
const submissionWindow = new Map<string, number[]>();


function toIso(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function sanitizeUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseCategory(value: string): Category {
  if (value === "nightlife" || value === "art") return value;
  return "music";
}

export async function POST(req: Request) {
  // Auth check
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to submit events." }, { status: 401 });
  }
  const { data: { user: authUser }, error: authError } = await supabaseServer().auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "Invalid session. Please sign in again." }, { status: 401 });
  }

  const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  const ip = ipHeader.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const existingHits = (submissionWindow.get(ip) ?? []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (existingHits.length >= RATE_LIMIT_MAX) {
    return NextResponse.json({ ok: false, error: "Too many submissions. Try again shortly." }, { status: 429 });
  }
  submissionWindow.set(ip, [...existingHits, now]);

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;

  const title = String(payload.title ?? "").trim();
  const description = String(payload.description ?? "").trim() || null;
  const websiteField = String(payload.website ?? "").trim();
  const startAtIso = toIso(typeof payload.startAt === "string" ? payload.startAt : null);
  const endAtIso = toIso(typeof payload.endAt === "string" ? payload.endAt : null);

  if (websiteField) {
    return NextResponse.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }

  if (!title || title.length < 3) {
    return NextResponse.json(
      { ok: false, error: "Title is required (min 3 characters)." },
      { status: 400 }
    );
  }

  if (!startAtIso) {
    return NextResponse.json(
      { ok: false, error: "Start date/time is required." },
      { status: 400 }
    );
  }

  if (title.length > TITLE_MAX) {
    return NextResponse.json(
      { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  if (description && description.length > DESCRIPTION_MAX) {
    return NextResponse.json(
      { ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const nowDate = new Date();
  if (new Date(startAtIso).getTime() < nowDate.getTime() - 60_000) {
    return NextResponse.json(
      { ok: false, error: "Start date/time must be in the future." },
      { status: 400 }
    );
  }

  if (endAtIso && new Date(endAtIso).getTime() < new Date(startAtIso).getTime()) {
    return NextResponse.json(
      { ok: false, error: "End date/time must be after start date/time." },
      { status: 400 }
    );
  }

  const category = parseCategory(String(payload.category ?? "music"));
  const visibility =
    payload.visibility === "private" ? "private" : "public";
  const sourceUrl = sanitizeUrl(typeof payload.sourceUrl === "string" ? payload.sourceUrl : null);
  if (typeof payload.sourceUrl === "string" && payload.sourceUrl.length > URL_MAX) {
    return NextResponse.json(
      { ok: false, error: `Ticket/info link must be ${URL_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const venueName = String(payload.venueName ?? "").trim();
  const venueAddress = String(payload.venueAddress ?? "").trim() || null;
  const venueCity = String(payload.venueCity ?? "Montréal").trim() || "Montréal";
  if (venueName.length > VENUE_NAME_MAX) {
    return NextResponse.json(
      { ok: false, error: `Venue name must be ${VENUE_NAME_MAX} characters or fewer.` },
      { status: 400 }
    );
  }
  if (venueAddress && venueAddress.length > VENUE_ADDRESS_MAX) {
    return NextResponse.json(
      { ok: false, error: `Venue address must be ${VENUE_ADDRESS_MAX} characters or fewer.` },
      { status: 400 }
    );
  }
  if (venueCity.length > CITY_MAX) {
    return NextResponse.json(
      { ok: false, error: `City must be ${CITY_MAX} characters or fewer.` },
      { status: 400 }
    );
  }

  const supabase = supabaseServer();

  // If the client already resolved a venue from autocomplete, use its ID directly.
  // Otherwise fall back to upsert-by-name.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const preselectedVenueId =
    typeof payload.venueId === "string" && UUID_RE.test(payload.venueId)
      ? payload.venueId
      : null;

  let venueId: string | null = preselectedVenueId;

  if (!venueId && venueName) {
    try {
      const result = await upsertVenue(supabase, {
        name: venueName,
        address_line1: venueAddress,
        city: venueCity,
        region: "QC",
        country: "CA",
        timezone: "America/Toronto",
      });
      venueId = result?.id ?? null;
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `Venue error: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 }
      );
    }
  }

  const sourceEventId = `manual-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from("events")
    .insert({
      title,
      title_normalized: normalizeText(title),
      description,
      start_at: startAtIso,
      end_at: endAtIso,
      timezone: "America/Toronto",
      status: "scheduled",
      category_primary: category,
      tags: ["community-submission"],
      age_restriction: null,
      image_url:
        typeof payload.imageUrl === "string" && payload.imageUrl.startsWith("https://")
          ? payload.imageUrl
          : null,
      source: "manual",
      source_event_id: sourceEventId,
      source_url: sourceUrl,
      venue_id: venueId,
      city_normalized: "montreal",
      visibility,
      is_approved: visibility === "private",
      creator_id: authUser.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Event insert failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, eventId: data.id });
}

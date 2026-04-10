import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue } from "@/lib/ingestion-shared";
import { createNotification } from "@/lib/notifications";

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 2000;
const VENUE_NAME_MAX = 120;
const VENUE_ADDRESS_MAX = 180;
const CITY_MAX = 80;
const URL_MAX = 500;
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;
const submissionWindow = new Map<string, number[]>();


// Interpret a naive "YYYY-MM-DDTHH:MM" string as America/Toronto local time and
// return a UTC ISO string. `new Date(naiveString)` on the server (UTC) would treat
// it as UTC and cause a 4-hour offset vs Montreal display time.
function toIso(value?: string | null): string | null {
  if (!value) return null;
  // If the value already has a timezone offset, parse it directly.
  if (/[Z+\-]\d*$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Naive datetime — interpret as America/Toronto local time.
  // Strategy: find the UTC offset for that wall-clock instant in Toronto,
  // then subtract it to get the correct UTC time.
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (!year || !month || !day) return null;

  // Use Intl to find the UTC offset at the given Toronto wall-clock time.
  // We iterate once to resolve DST correctly.
  const guessUtc = Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0);
  const torontoParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(guessUtc));
  const tp = Object.fromEntries(torontoParts.filter(p => p.type !== "literal").map(p => [p.type, Number(p.value)]));
  const offsetMs = guessUtc - Date.UTC(tp.year, tp.month - 1, tp.day, tp.hour === 24 ? 0 : tp.hour, tp.minute, tp.second);
  const utcMs = guessUtc + offsetMs;
  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
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
  const valid: Category[] = ["concerts", "nightlife", "arts_culture", "comedy", "sports", "family"];
  if ((valid as string[]).includes(value)) return value as Category;
  if (value === "music") return "concerts";
  if (value === "art") return "arts_culture";
  return "concerts";
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
  const descriptionTitle = typeof payload.descriptionTitle === "string" ? payload.descriptionTitle.trim().slice(0, 200) || null : null;
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
  const venueLat = typeof payload.lat === "number" && isFinite(payload.lat) ? payload.lat : null;
  const venueLng = typeof payload.lng === "number" && isFinite(payload.lng) ? payload.lng : null;
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
  // Optional event options (private events)
  const spotsMode = payload.spotsMode === "limited" ? "limited" : "unlimited";
  const spotsLimitRaw = typeof payload.spotsLimit === "number" ? Math.floor(payload.spotsLimit) : null;
  const spotsLimit = spotsMode === "limited" && spotsLimitRaw !== null && spotsLimitRaw > 0 ? spotsLimitRaw : null;
  const price = typeof payload.price === "number" && payload.price > 0 ? payload.price : null;
  const currency = price && (payload.currency === "CAD" || payload.currency === "USD") ? payload.currency : null;
  const paymentMethod = price && payload.paymentMethod === "interac" ? "interac" : null;
  const paymentContactRaw = typeof payload.paymentContact === "string" ? payload.paymentContact.trim().slice(0, 200) : null;
  const paymentContact = paymentMethod ? paymentContactRaw || null : null;
  // rsvp_deadline is a DATE column — send YYYY-MM-DD only, not a full ISO timestamp
  const rsvpDeadlineDate =
    typeof payload.rsvpDeadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.rsvpDeadline.trim())
      ? payload.rsvpDeadline.trim()
      : null;

  const cohostIds = Array.isArray(payload.cohostIds)
    ? (payload.cohostIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && UUID_RE.test(id)
      )
    : [];

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
        lat: venueLat,
        lng: venueLng,
      });
      venueId = result?.id ?? null;
      // upsertVenue uses ignoreDuplicates: true, so existing venue rows are NOT
      // updated on conflict. If we have real coordinates, backfill them when the
      // stored value is still null (safe no-op if coords are already present).
      if (venueId && venueLat !== null && venueLng !== null) {
        await supabase.from("venues")
          .update({ lat: venueLat, lng: venueLng })
          .eq("id", venueId)
          .is("lat", null);
      }
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
      description_title: descriptionTitle,
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
      // cohost_ids starts empty — cohosts join after accepting an invitation
      ...(visibility === "private" ? {
        spots_mode: spotsMode,
        ...(spotsLimit !== null ? { spots_limit: spotsLimit } : {}),
        ...(price !== null ? { price, currency, payment_method: paymentMethod, payment_contact: paymentContact } : {}),
        ...(rsvpDeadlineDate ? { rsvp_deadline: rsvpDeadlineDate } : {}),
      } : {}),
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Event insert failed: ${error.message}` },
      { status: 500 }
    );
  }

  // Send cohost invitations — fire-and-forget (don't block the response)
  if (cohostIds.length > 0) {
    for (const inviteeId of cohostIds) {
      createNotification({
        userId: inviteeId,
        type: "cohost_invite",
        actorId: authUser.id,
        entityId: data.id,
        metadata: { status: "pending" },
      }).catch((err: unknown) => {
        console.error("[submit] cohost_invite notification failed:", err);
      });
    }
  }

  return NextResponse.json({ ok: true, eventId: data.id });
}

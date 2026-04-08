import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { normalizeText, upsertVenue } from "@/lib/ingestion-shared";

type Category = "concerts" | "nightlife" | "arts_culture" | "comedy" | "sports" | "family";
const TITLE_MAX = 140;
const DESCRIPTION_MAX = 2000;
const VENUE_NAME_MAX = 120;
const VENUE_ADDRESS_MAX = 180;
const CITY_MAX = 80;
const URL_MAX = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Interpret a naive "YYYY-MM-DDTHH:MM" string as America/Toronto local time and
// return a UTC ISO string. `new Date(naiveString)` on the server (UTC) would treat
// it as UTC and cause a 4-hour offset vs Montreal display time.
function toIso(value?: string | null): string | null {
  if (!value) return null;
  if (/[Z+\-]\d*$/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  if (!year || !month || !day) return null;
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

async function resolveAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// GET /api/events/[id] — return minimal event info for map deep-linking.
// Uses the service-role client so it works for private events and events outside
// the discovery window without requiring the caller to be authenticated.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid event id." }, { status: 400 });
  }
  const { data, error } = await supabaseServer()
    .from("events")
    .select("id,title,start_at,image_url,source,category_primary,venues(lat,lng,name,address_line1)")
    .eq("id", id)
    .single();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, event: data });
}

// PATCH /api/events/[id] — update a manually-created event owned by the caller
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await resolveAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const supabase = supabaseServer();

  // Verify ownership and source before touching anything else
  const { data: existing } = await supabase
    .from("events")
    .select("id,source,creator_id,is_approved,is_rejected,visibility,venue_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  if (existing.source !== "manual") {
    return NextResponse.json({ ok: false, error: "Imported events cannot be edited." }, { status: 403 });
  }
  if (existing.creator_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You don't own this event." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate fields
  const title = String(body.title ?? "").trim();
  if (!title || title.length < 3) {
    return NextResponse.json({ ok: false, error: "Title is required (min 3 characters)." }, { status: 400 });
  }
  if (title.length > TITLE_MAX) {
    return NextResponse.json({ ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` }, { status: 400 });
  }

  const description = String(body.description ?? "").trim() || null;
  const descriptionTitle = typeof body.descriptionTitle === "string" ? body.descriptionTitle.trim().slice(0, 200) || null : null;
  if (description && description.length > DESCRIPTION_MAX) {
    return NextResponse.json({ ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` }, { status: 400 });
  }

  const startAtIso = toIso(typeof body.startAt === "string" ? body.startAt : null);
  const endAtIso = toIso(typeof body.endAt === "string" ? body.endAt : null);
  if (!startAtIso) {
    return NextResponse.json({ ok: false, error: "Start date/time is required." }, { status: 400 });
  }
  if (endAtIso && new Date(endAtIso) < new Date(startAtIso)) {
    return NextResponse.json({ ok: false, error: "End date/time must be after start date/time." }, { status: 400 });
  }

  const category = parseCategory(String(body.category ?? "music"));
  const newVisibility = body.visibility === "private" ? "private" : "public";

  if (typeof body.sourceUrl === "string" && body.sourceUrl.length > URL_MAX) {
    return NextResponse.json({ ok: false, error: `Ticket/info link must be ${URL_MAX} characters or fewer.` }, { status: 400 });
  }
  const sourceUrl = sanitizeUrl(typeof body.sourceUrl === "string" ? body.sourceUrl : null);

  const venueName = String(body.venueName ?? "").trim();
  const venueAddress = String(body.venueAddress ?? "").trim() || null;
  const venueCity = String(body.venueCity ?? "Montréal").trim() || "Montréal";
  const venueLat = typeof body.lat === "number" && isFinite(body.lat) ? body.lat : null;
  const venueLng = typeof body.lng === "number" && isFinite(body.lng) ? body.lng : null;
  if (venueName.length > VENUE_NAME_MAX) {
    return NextResponse.json({ ok: false, error: `Venue name must be ${VENUE_NAME_MAX} characters or fewer.` }, { status: 400 });
  }
  if (venueAddress && venueAddress.length > VENUE_ADDRESS_MAX) {
    return NextResponse.json({ ok: false, error: `Venue address must be ${VENUE_ADDRESS_MAX} characters or fewer.` }, { status: 400 });
  }
  if (venueCity.length > CITY_MAX) {
    return NextResponse.json({ ok: false, error: `City must be ${CITY_MAX} characters or fewer.` }, { status: 400 });
  }

  // Resolve venue
  // For private events being edited: if the event already has a venue, update it in-place
  // so address changes are actually saved (upsertVenue ignores duplicate name conflicts).
  const existingVenueId = (existing as { venue_id?: string | null }).venue_id ?? null;
  const preselectedVenueId =
    typeof body.venueId === "string" && UUID_RE.test(body.venueId) ? body.venueId : null;
  let venueId: string | null = preselectedVenueId;

  if (!venueId && venueName && newVisibility === "private" && existingVenueId) {
    // Update the existing venue directly so address changes are persisted
    try {
      await supabase
        .from("venues")
        .update({
          name: venueName,
          address_line1: venueAddress,
          city: venueCity,
          ...(venueLat !== null ? { lat: venueLat } : {}),
          ...(venueLng !== null ? { lng: venueLng } : {}),
        })
        .eq("id", existingVenueId);
      venueId = existingVenueId;
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: `Venue error: ${err instanceof Error ? err.message : "unknown"}` },
        { status: 500 }
      );
    }
  } else if (!venueId && venueName) {
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
      // Backfill coords on existing venue rows that were inserted without them.
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

  // Image URL: accept HTTPS URL, empty string, or null (to clear)
  const rawImageUrl = body.imageUrl;
  const imageUrl =
    typeof rawImageUrl === "string" && rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : null;

  // Preserve approval status unless switching to private
  const isApproved = newVisibility === "private" ? true : existing.is_approved;
  const isRejected = newVisibility === "private" ? false : existing.is_rejected;

  // Optional private-event fields
  const cohostIdsRaw = body.cohostIds;
  const cohostIds = Array.isArray(cohostIdsRaw)
    ? cohostIdsRaw.filter((v) => typeof v === "string" && UUID_RE.test(v))
    : [];

  const spotsMode = body.spotsMode === "limited" ? "limited" : "unlimited";
  const spotsLimitRaw = typeof body.spotsLimit === "number" && body.spotsLimit > 0 ? body.spotsLimit : null;
  const priceRaw = typeof body.price === "number" && body.price > 0 ? body.price : null;
  const currency = priceRaw ? (body.currency === "USD" ? "USD" : "CAD") : null;
  const paymentMethod = priceRaw && body.paymentMethod === "interac" ? "interac" : null;
  const paymentContact = paymentMethod
    ? (typeof body.paymentContact === "string" ? body.paymentContact.trim().slice(0, 200) || null : null)
    : null;
  const rsvpDeadlineDate =
    typeof body.rsvpDeadline === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.rsvpDeadline.trim())
      ? body.rsvpDeadline.trim()
      : null;

  const { error: updateError } = await supabase
    .from("events")
    .update({
      title,
      title_normalized: normalizeText(title),
      description,
      description_title: descriptionTitle,
      start_at: startAtIso,
      end_at: endAtIso,
      category_primary: category,
      source_url: sourceUrl,
      venue_id: venueId,
      visibility: newVisibility,
      is_approved: isApproved,
      is_rejected: isRejected,
      image_url: imageUrl,
      ...(newVisibility === "private" ? {
        cohost_ids: cohostIds.length > 0 ? cohostIds : null,
        spots_mode: spotsMode,
        spots_limit: spotsLimitRaw,
        price: priceRaw,
        currency,
        payment_method: paymentMethod,
        payment_contact: paymentContact,
        rsvp_deadline: rsvpDeadlineDate,
      } : {}),
    })
    .eq("id", id)
    .eq("source", "manual")
    .eq("creator_id", user.id); // double-check ownership at DB level

  if (updateError) {
    return NextResponse.json({ ok: false, error: `Update failed: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/events/[id] — permanently remove a manually-created event owned by the caller
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await resolveAuth(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const supabase = supabaseServer();

  // Verify ownership and source before deleting
  const { data: existing } = await supabase
    .from("events")
    .select("id,source,creator_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ ok: false, error: "Event not found." }, { status: 404 });
  if (existing.source !== "manual") {
    return NextResponse.json({ ok: false, error: "Imported events cannot be deleted." }, { status: 403 });
  }
  if (existing.creator_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You don't own this event." }, { status: 403 });
  }

  const { error: deleteError } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("source", "manual")
    .eq("creator_id", user.id); // double-check at DB level

  if (deleteError) {
    return NextResponse.json({ ok: false, error: `Delete failed: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

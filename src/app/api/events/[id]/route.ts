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

function toIso(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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
    .select("id,source,creator_id,is_approved,is_rejected,visibility")
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
  const preselectedVenueId =
    typeof body.venueId === "string" && UUID_RE.test(body.venueId) ? body.venueId : null;
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

  // Image URL: accept HTTPS URL, empty string, or null (to clear)
  const rawImageUrl = body.imageUrl;
  const imageUrl =
    typeof rawImageUrl === "string" && rawImageUrl.startsWith("https://")
      ? rawImageUrl
      : null;

  // Preserve approval status unless switching to private
  const isApproved = newVisibility === "private" ? true : existing.is_approved;
  const isRejected = newVisibility === "private" ? false : existing.is_rejected;

  const { error: updateError } = await supabase
    .from("events")
    .update({
      title,
      title_normalized: normalizeText(title),
      description,
      start_at: startAtIso,
      end_at: endAtIso,
      category_primary: category,
      source_url: sourceUrl,
      venue_id: venueId,
      visibility: newVisibility,
      is_approved: isApproved,
      is_rejected: isRejected,
      image_url: imageUrl,
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

import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// ── Constants ─────────────────────────────────────────────────────────────────

const NAME_MAX = 120;
const BIO_MAX = 1000;
const URL_MAX = 500;
const SLUG_MAX = 100;

const VALID_TYPES = [
  "venue", "promoter", "artist", "business",
  "festival", "collective", "brand",
  "nonprofit", "school", "other",
] as const;
type OrganizerType = typeof VALID_TYPES[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/**
 * Derives a URL-safe slug from a display name.
 * Mirrors the SQL formula used in the slug migration and attachVenueOrganizer:
 *   normalizeText (NFD strip + lowercase) → replace non-alphanumeric runs with
 *   hyphens → collapse consecutive hyphens → trim leading/trailing hyphens.
 */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

// ── POST /api/organizers ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to create an organizer." }, { status: 401 });
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  // ── Validate name ───────────────────────────────────────────────────────────
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  if (!name || name.length < 2) {
    return NextResponse.json(
      { ok: false, error: "Name is required (min 2 characters)." },
      { status: 400 },
    );
  }
  if (name.length > NAME_MAX) {
    return NextResponse.json(
      { ok: false, error: `Name must be ${NAME_MAX} characters or fewer.` },
      { status: 400 },
    );
  }

  // ── Validate type ────────────────────────────────────────────────────────────
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  if (!(VALID_TYPES as readonly string[]).includes(type)) {
    return NextResponse.json(
      { ok: false, error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }

  // ── Slug ─────────────────────────────────────────────────────────────────────
  // Client may supply a preferred slug; fall back to derived.
  const rawSlug = typeof payload.slug === "string" ? payload.slug.trim() : "";
  const slug = rawSlug ? slugify(rawSlug) : slugify(name);

  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Could not derive a valid slug from the name. Try using a different name." },
      { status: 400 },
    );
  }
  if (slug.length > SLUG_MAX) {
    return NextResponse.json(
      { ok: false, error: `Slug must be ${SLUG_MAX} characters or fewer.` },
      { status: 400 },
    );
  }

  // ── Optional fields ──────────────────────────────────────────────────────────
  const bio =
    typeof payload.bio === "string" && payload.bio.trim()
      ? payload.bio.trim().slice(0, BIO_MAX)
      : null;

  const websiteUrl =
    typeof payload.website_url === "string" && payload.website_url.trim()
      ? sanitizeUrl(payload.website_url.trim())
      : null;
  if (typeof payload.website_url === "string" && payload.website_url.trim() && !websiteUrl) {
    return NextResponse.json({ ok: false, error: "Invalid website URL." }, { status: 400 });
  }
  if (typeof payload.website_url === "string" && payload.website_url.length > URL_MAX) {
    return NextResponse.json(
      { ok: false, error: `Website URL must be ${URL_MAX} characters or fewer.` },
      { status: 400 },
    );
  }

  const instagramUrl =
    typeof payload.instagram_url === "string" && payload.instagram_url.trim()
      ? sanitizeUrl(payload.instagram_url.trim())
      : null;
  if (typeof payload.instagram_url === "string" && payload.instagram_url.trim() && !instagramUrl) {
    return NextResponse.json({ ok: false, error: "Invalid Instagram URL." }, { status: 400 });
  }
  if (typeof payload.instagram_url === "string" && payload.instagram_url.length > URL_MAX) {
    return NextResponse.json(
      { ok: false, error: `Instagram URL must be ${URL_MAX} characters or fewer.` },
      { status: 400 },
    );
  }

  const supabase = supabaseServer();

  // ── Slug uniqueness check ────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from("organizers")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { ok: false, error: `The slug "${slug}" is already taken. Try a different name or slug.` },
      { status: 409 },
    );
  }

  // ── name_normalized (mirrors SQL unaccent + lower + trim convention) ─────────
  const nameNormalized = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

  // ── Insert organizer + owner membership (both or neither) ────────────────────
  //
  // Supabase JS does not expose BEGIN/COMMIT directly.
  // We simulate atomicity by:
  //   1. Inserting the organizer row.
  //   2. Immediately inserting the membership row.
  //   3. If the membership insert fails, deleting the organizer row and returning
  //      a 500 — the organizer cannot exist without an owner.
  //
  // This is safe because service_role is the only writer here and no other
  // concurrent path can observe the organizer in the window between the two
  // inserts (the membership is created before the response is returned, and
  // the public-read policy on organizers is read-only — no write race exists).

  const { data: organizer, error: orgError } = await supabase
    .from("organizers")
    .insert({
      name,
      name_normalized: nameNormalized,
      type: type as OrganizerType,
      slug,
      bio,
      website_url: websiteUrl,
      instagram_url: instagramUrl,
    })
    .select("id")
    .single();

  if (orgError || !organizer) {
    // Unique index violation on slug would have been caught above; any error
    // here is unexpected (e.g. name_normalized + type collision with an
    // existing ingestion-created organizer).
    if (orgError?.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "An organizer with this name already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Failed to create organizer. Please try again." },
      { status: 500 },
    );
  }

  const { error: memberError } = await supabase
    .from("organizer_members")
    .insert({
      organizer_id: organizer.id,
      user_id: user.id,   // always taken from the verified auth token, never from the request body
      role: "owner",
      status: "active",
    });

  if (memberError) {
    // Membership failed — roll back by deleting the organizer so the DB is
    // never left with an ownerless organizer row.
    await supabase.from("organizers").delete().eq("id", organizer.id);
    return NextResponse.json(
      { ok: false, error: "Failed to assign ownership. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, organizerId: organizer.id, slug }, { status: 201 });
}

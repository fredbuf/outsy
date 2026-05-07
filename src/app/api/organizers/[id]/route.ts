import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// ── Constants ─────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_MAX = 120;
const BIO_MAX = 1000;
const URL_MAX = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveAuth(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
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

// ── PATCH /api/organizers/[id] ────────────────────────────────────────────────
//
// Partial update for organizer profile fields. Only fields explicitly present
// in the request body are written; omitted fields are left unchanged.
//
// Allowed fields: name, bio, website_url, instagram_url
// Not allowed via this route: type, slug, handle (handle has its own route).

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid organizer id." }, { status: 400 });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  const user = await resolveAuth(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
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

  const supabase = supabaseServer();

  // ── Authorization ─────────────────────────────────────────────────────────
  // User must be an active owner or admin of this organizer.
  // The membership check is done against the DB (not a JWT claim) so it
  // always reflects the current state of organizer_members.
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", id)
    .eq("user_id", user.id)   // user_id always from verified token, never from body
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to edit this organizer." },
      { status: 403 },
    );
  }

  // ── Build partial update patch ────────────────────────────────────────────
  // Use `"key" in payload` so that an explicit null or empty string is treated
  // as intentional (clear the field), while a missing key means "leave alone".
  const patch: Record<string, unknown> = {};

  if ("name" in payload) {
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
    patch.name = name;
    // Keep name_normalized in sync — mirrors the formula used on creation and in SQL.
    patch.name_normalized = name
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
  }

  if ("bio" in payload) {
    // null or empty string → clear the bio field.
    patch.bio =
      typeof payload.bio === "string" && payload.bio.trim()
        ? payload.bio.trim().slice(0, BIO_MAX)
        : null;
  }

  if ("website_url" in payload) {
    if (payload.website_url === null || payload.website_url === "") {
      patch.website_url = null;
    } else if (typeof payload.website_url === "string") {
      const trimmed = payload.website_url.trim();
      if (trimmed.length > URL_MAX) {
        return NextResponse.json(
          { ok: false, error: `Website URL must be ${URL_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      const clean = sanitizeUrl(trimmed);
      if (!clean) {
        return NextResponse.json({ ok: false, error: "Invalid website URL." }, { status: 400 });
      }
      patch.website_url = clean;
    }
  }

  if ("instagram_url" in payload) {
    if (payload.instagram_url === null || payload.instagram_url === "") {
      patch.instagram_url = null;
    } else if (typeof payload.instagram_url === "string") {
      const trimmed = payload.instagram_url.trim();
      if (trimmed.length > URL_MAX) {
        return NextResponse.json(
          { ok: false, error: `Instagram URL must be ${URL_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      const clean = sanitizeUrl(trimmed);
      if (!clean) {
        return NextResponse.json({ ok: false, error: "Invalid Instagram URL." }, { status: 400 });
      }
      patch.instagram_url = clean;
    }
  }

  if ("tiktok_url" in payload) {
    if (payload.tiktok_url === null || payload.tiktok_url === "") {
      patch.tiktok_url = null;
    } else if (typeof payload.tiktok_url === "string") {
      const trimmed = payload.tiktok_url.trim();
      if (trimmed.length > URL_MAX) {
        return NextResponse.json(
          { ok: false, error: `TikTok URL must be ${URL_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      const clean = sanitizeUrl(trimmed);
      if (!clean) {
        return NextResponse.json({ ok: false, error: "Invalid TikTok URL." }, { status: 400 });
      }
      patch.tiktok_url = clean;
    }
  }

  if ("youtube_url" in payload) {
    if (payload.youtube_url === null || payload.youtube_url === "") {
      patch.youtube_url = null;
    } else if (typeof payload.youtube_url === "string") {
      const trimmed = payload.youtube_url.trim();
      if (trimmed.length > URL_MAX) {
        return NextResponse.json(
          { ok: false, error: `YouTube URL must be ${URL_MAX} characters or fewer.` },
          { status: 400 },
        );
      }
      const clean = sanitizeUrl(trimmed);
      if (!clean) {
        return NextResponse.json({ ok: false, error: "Invalid YouTube URL." }, { status: 400 });
      }
      patch.youtube_url = clean;
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No valid fields to update." }, { status: 400 });
  }

  // ── Update ────────────────────────────────────────────────────────────────
  const { data: organizer, error: updateError } = await supabase
    .from("organizers")
    .update(patch)
    .eq("id", id)
    .select("id,name,type,slug,bio,website_url,instagram_url,tiktok_url,youtube_url,image_url")
    .single();

  if (updateError || !organizer) {
    return NextResponse.json(
      { ok: false, error: "Failed to update organizer. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, organizer });
}

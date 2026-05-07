import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9_]{3,30}$/;
const COOLDOWN_DAYS = 30;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// PATCH /api/organizers/[id]/handle
// Body: { handle: string }
//
// Allows an organizer owner to change the global handle.
// Enforces:
//   - owner-only (not admin)
//   - format ^[a-z0-9_]{3,30}$
//   - 30-day cooldown via COALESCE(changed_at, created_at)
//   - uniqueness via DB PK — catches race conditions
// Returns: { ok, handle, nextChangeAllowed: ISO string }

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  // Parse body
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const rawHandle = typeof payload.handle === "string" ? payload.handle.trim().toLowerCase() : "";

  if (!HANDLE_RE.test(rawHandle))
    return NextResponse.json(
      { ok: false, error: "Handle must be 3–30 characters: letters, numbers, underscores only." },
      { status: 400 },
    );

  const supabase = supabaseServer();

  // ── Owner-only check (not admin) ─────────────────────────────────────────────
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", orgId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (!membership)
    return NextResponse.json(
      { ok: false, error: "Only the organizer owner can change the handle." },
      { status: 403 },
    );

  // ── Fetch current handle row ─────────────────────────────────────────────────
  const { data: currentRow } = await supabase
    .from("handles")
    .select("handle, created_at, changed_at")
    .eq("owner_type", "organizer")
    .eq("owner_id", orgId)
    .maybeSingle();

  // ── No-op: already the same handle ──────────────────────────────────────────
  if (currentRow?.handle === rawHandle)
    return NextResponse.json({ ok: true, handle: rawHandle, nextChangeAllowed: null });

  // ── Cooldown check ───────────────────────────────────────────────────────────
  // Use changed_at if set (owner-initiated), otherwise created_at (backfill/first set).
  // Cooldown starts from whichever is more recent.
  if (currentRow) {
    const baseline = currentRow.changed_at ?? currentRow.created_at;
    const daysSince = (Date.now() - new Date(baseline as string).getTime()) / 86_400_000;
    if (daysSince < COOLDOWN_DAYS) {
      const nextChangeAllowed = new Date(
        new Date(baseline as string).getTime() + COOLDOWN_DAYS * 86_400_000,
      ).toISOString();
      const daysLeft = Math.ceil(COOLDOWN_DAYS - daysSince);
      return NextResponse.json(
        {
          ok: false,
          error: `Handle can only be changed once every ${COOLDOWN_DAYS} days. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
          nextChangeAllowed,
        },
        { status: 429 },
      );
    }
  }

  // ── Attempt the update/insert ────────────────────────────────────────────────
  // Strategy:
  //   - If a row exists for this org: UPDATE the handle in place and set changed_at.
  //     The DB PK unique constraint will reject if the new handle is already taken.
  //   - If no row exists yet (org was skipped during backfill): INSERT.
  //
  // Both paths use the service-role client (bypasses RLS).
  // A unique-constraint violation means the handle is taken — return a clean error.

  let error: { code?: string; message: string } | null = null;

  if (currentRow) {
    // UPDATE: change handle value in the existing row.
    // Supabase does not support updating a PK via .update(), so we use a raw RPC
    // or the approach of delete + insert. To keep it atomic and simple, we do:
    // 1. INSERT the new row (will fail fast if taken)
    // 2. DELETE the old row only if insert succeeded
    const { error: insertErr } = await supabase
      .from("handles")
      .insert({ handle: rawHandle, owner_type: "organizer", owner_id: orgId, changed_at: new Date().toISOString() });

    if (insertErr) {
      error = insertErr;
    } else {
      // Insert succeeded — now remove the old handle.
      await supabase.from("handles").delete().eq("handle", currentRow.handle);
    }
  } else {
    // INSERT: first time this org gets a handle.
    const { error: insertErr } = await supabase
      .from("handles")
      .insert({ handle: rawHandle, owner_type: "organizer", owner_id: orgId, changed_at: new Date().toISOString() });
    if (insertErr) error = insertErr;
  }

  if (error) {
    // Postgres unique_violation = code 23505
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "That handle is already taken." },
        { status: 409 },
      );
    }
    console.error("[PATCH /api/organizers/[id]/handle]", error.message);
    return NextResponse.json({ ok: false, error: "Failed to update handle. Please try again." }, { status: 500 });
  }

  // Return next allowed change date (30 days from now)
  const nextChangeAllowed = new Date(Date.now() + COOLDOWN_DAYS * 86_400_000).toISOString();
  return NextResponse.json({ ok: true, handle: rawHandle, nextChangeAllowed });
}

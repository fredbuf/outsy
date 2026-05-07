import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_ROLES = ["admin", "editor"] as const;
type InviteRole = typeof VALID_ROLES[number];

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── GET /api/organizers/[id]/members ─────────────────────────────────────────
// owner or admin can view the member list.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const supabase = supabaseServer();

  // Verify caller is an active owner or admin.
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", id)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .maybeSingle();

  if (!membership)
    return NextResponse.json({ ok: false, error: "You don't have access to this organizer." }, { status: 403 });

  // Fetch active + pending members.
  const { data: members, error: membersError } = await supabase
    .from("organizer_members")
    .select("user_id, role, status, created_at")
    .eq("organizer_id", id)
    .in("status", ["active", "pending"])
    .order("created_at", { ascending: true });

  if (membersError) {
    console.error("[GET /api/organizers/[id]/members]", membersError);
    return NextResponse.json({ ok: false, error: "Failed to load members." }, { status: 500 });
  }

  if (!members || members.length === 0)
    return NextResponse.json({ ok: true, members: [] });

  // Fetch profiles for display info.
  const userIds = members.map((m) => m.user_id as string);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", userIds);

  const profileMap = Object.fromEntries(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );

  const result = members.map((m) => {
    const p = profileMap[m.user_id as string];
    return {
      userId: m.user_id as string,
      role: m.role as string,
      status: m.status as string,
      joinedAt: m.created_at as string,
      displayName: (p?.display_name as string | null) ?? null,
      username: (p?.username as string | null) ?? null,
      avatarUrl: (p?.avatar_url as string | null) ?? null,
    };
  });

  return NextResponse.json({ ok: true, members: result });
}

// ── POST /api/organizers/[id]/members ────────────────────────────────────────
// owner only. Invite an existing user by email or handle.
// identifier is treated as email when it contains "@"; otherwise as a handle.
// Handle lookup queries handles where owner_type = 'user' only.

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  // Parse body.
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const raw = typeof payload.identifier === "string" ? payload.identifier.trim() : "";
  const role: InviteRole = VALID_ROLES.includes(payload.role as InviteRole)
    ? (payload.role as InviteRole)
    : "admin";

  if (!raw)
    return NextResponse.json({ ok: false, error: "Email or handle is required." }, { status: 400 });

  const supabase = supabaseServer();

  // Verify caller is an active owner.
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", id)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (!membership)
    return NextResponse.json({ ok: false, error: "Only owners can invite members." }, { status: 403 });

  // ── Resolve target user ───────────────────────────────────────────────────
  // email path: identifier contains "@" (could be user@email.com or @handle with @)
  // handle path: no "@" in the remainder after stripping a leading "@"
  let targetUserId: string | null = null;

  const isEmail = raw.includes("@") && raw.indexOf("@") > 0;

  if (isEmail) {
    // Email-based lookup is not supported (no email column on profiles and
    // auth.admin.getUserByEmail is not available on the client SDK).
    return NextResponse.json(
      { ok: false, error: "Invite by email is not available yet. Use @handle instead." },
      { status: 400 },
    );
  } else {
    // Handle lookup: strip leading "@", normalize to lowercase.
    const handle = raw.replace(/^@/, "").toLowerCase();
    if (!handle)
      return NextResponse.json({ ok: false, error: "Handle cannot be empty." }, { status: 400 });
    // Only match user handles — organizer handles are explicitly excluded.
    const { data: handleRow } = await supabase
      .from("handles")
      .select("owner_id")
      .eq("handle", handle)
      .eq("owner_type", "user")
      .maybeSingle();
    if (!handleRow)
      return NextResponse.json({ ok: false, error: "No user found with that handle." }, { status: 404 });
    targetUserId = handleRow.owner_id as string;
  }

  if (!targetUserId)
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });

  // Prevent inviting yourself.
  if (targetUserId === user.id)
    return NextResponse.json({ ok: false, error: "You are already a member of this organizer." }, { status: 409 });

  // Check if target is already a member or has a pending invite.
  const { data: existing } = await supabase
    .from("organizer_members")
    .select("role, status")
    .eq("organizer_id", id)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (existing?.status === "active")
    return NextResponse.json({ ok: false, error: "That user is already a member." }, { status: 409 });
  if (existing?.status === "pending")
    return NextResponse.json({ ok: false, error: "That user already has a pending invite." }, { status: 409 });

  // Fetch organizer name + slug for the notification.
  const { data: organizer } = await supabase
    .from("organizers")
    .select("name, slug")
    .eq("id", id)
    .maybeSingle();

  // Insert or update to status = "pending".
  let insertError: { code?: string; message: string } | null = null;

  if (existing) {
    // Row exists with non-pending/non-active status — update it.
    const { error } = await supabase
      .from("organizer_members")
      .update({ role, status: "pending" })
      .eq("organizer_id", id)
      .eq("user_id", targetUserId);
    insertError = error;
  } else {
    // No row — insert fresh as pending.
    const { error } = await supabase
      .from("organizer_members")
      .insert({ organizer_id: id, user_id: targetUserId, role, status: "pending" });
    insertError = error;
  }

  if (insertError) {
    console.error("[POST /api/organizers/[id]/members] code=%s message=%s", insertError.code, insertError.message);
    if (insertError.code === "23505")
      return NextResponse.json({ ok: false, error: "That user is already a member." }, { status: 409 });
    return NextResponse.json({ ok: false, error: "Failed to invite member. Please try again." }, { status: 500 });
  }

  // Send notification to the invited user.
  await createNotification({
    userId: targetUserId,
    type: "organizer_member_invite",
    actorId: user.id,
    entityId: id,
    metadata: {
      organizerName: (organizer?.name as string | null) ?? "",
      organizerSlug: (organizer?.slug as string | null) ?? null,
      role,
    },
  });

  // Fetch the invited user's profile for the response.
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, username, avatar_url")
    .eq("id", targetUserId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    member: {
      userId: targetUserId,
      role,
      status: "pending",
      displayName: (profile?.display_name as string | null) ?? null,
      username: (profile?.username as string | null) ?? null,
      avatarUrl: (profile?.avatar_url as string | null) ?? null,
    },
  }, { status: 201 });
}

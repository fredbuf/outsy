import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

/** Verify the authenticated user is an active member of followerOrgId. */
async function verifyMembership(userId: string, followerOrgId: string): Promise<boolean> {
  const { data, error } = await supabaseServer()
    .from("organizer_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organizer_id", followerOrgId)
    .eq("status", "active")
    .maybeSingle();
  if (error) console.error("[org-follow] verifyMembership error:", error.message, { userId, followerOrgId });
  return !!data;
}

// GET /api/organizers/[id]/org-follow?followerOrgId=xxx
// Returns { ok: true, following: boolean } — whether followerOrgId follows [id].
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: followedOrgId } = await params;
  if (!UUID_RE.test(followedOrgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const url = new URL(req.url);
  const followerOrgId = url.searchParams.get("followerOrgId") ?? "";
  if (!UUID_RE.test(followerOrgId))
    return NextResponse.json({ ok: false, error: "Invalid followerOrgId." }, { status: 400 });

  // Verify user manages the follower org.
  const isMember = await verifyMembership(user.id, followerOrgId);
  if (!isMember)
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const { data } = await supabaseServer()
    .from("organizer_follows")
    .select("follower_organizer_id")
    .eq("follower_organizer_id", followerOrgId)
    .eq("followed_organizer_id", followedOrgId)
    .maybeSingle();

  return NextResponse.json({ ok: true, following: !!data });
}

// POST /api/organizers/[id]/org-follow
// Body: { followerOrgId: string }
// The followerOrgId organizer follows [id].
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: followedOrgId } = await params;
  if (!UUID_RE.test(followedOrgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { followerOrgId?: string };
  const followerOrgId = body.followerOrgId ?? "";
  if (!UUID_RE.test(followerOrgId))
    return NextResponse.json({ ok: false, error: "Invalid followerOrgId." }, { status: 400 });

  // Prevent self-follow (also enforced at DB level).
  if (followerOrgId === followedOrgId)
    return NextResponse.json({ ok: false, error: "An organizer cannot follow itself." }, { status: 400 });

  // Verify user manages the follower org — never trust client-supplied org identity.
  const isMember = await verifyMembership(user.id, followerOrgId);
  if (!isMember)
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const supabase = supabaseServer();

  // Verify target organizer exists.
  const { data: targetOrg } = await supabase
    .from("organizers")
    .select("id")
    .eq("id", followedOrgId)
    .maybeSingle();
  if (!targetOrg)
    return NextResponse.json({ ok: false, error: "Organizer not found." }, { status: 404 });

  const { error } = await supabase
    .from("organizer_follows")
    .upsert(
      { follower_organizer_id: followerOrgId, followed_organizer_id: followedOrgId },
      { onConflict: "follower_organizer_id,followed_organizer_id" },
    );

  if (error) {
    console.error("[POST /api/organizers/org-follow] upsert failed:", error.message, { followerOrgId, followedOrgId });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, following: true });
}

// DELETE /api/organizers/[id]/org-follow
// Body: { followerOrgId: string }
// The followerOrgId organizer unfollows [id].
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { id: followedOrgId } = await params;
  if (!UUID_RE.test(followedOrgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const body = await req.json().catch(() => ({})) as { followerOrgId?: string };
  const followerOrgId = body.followerOrgId ?? "";
  if (!UUID_RE.test(followerOrgId))
    return NextResponse.json({ ok: false, error: "Invalid followerOrgId." }, { status: 400 });

  // Verify user manages the follower org.
  const isMember = await verifyMembership(user.id, followerOrgId);
  if (!isMember)
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });

  const { error } = await supabaseServer()
    .from("organizer_follows")
    .delete()
    .eq("follower_organizer_id", followerOrgId)
    .eq("followed_organizer_id", followedOrgId);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, following: false });
}

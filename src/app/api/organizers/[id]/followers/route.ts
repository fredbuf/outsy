import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/organizers/[id]/followers
// Returns combined follower list: user followers + organizer followers.
// Public — no auth required.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const supabase = supabaseServer();

  // ── User followers (organizer_followers → profiles) ───────────────────────
  const { data: userLinks } = await supabase
    .from("organizer_followers")
    .select("user_id")
    .eq("organizer_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const userIds = (userLinks ?? []).map((r) => r.user_id as string);

  const userProfiles =
    userIds.length > 0
      ? ((await supabase
          .from("profiles")
          .select("id, display_name, username, avatar_url")
          .in("id", userIds)).data ?? [])
      : [];

  // Preserve insertion order from userLinks.
  const profileMap = new Map(
    (userProfiles as { id: string; display_name: string | null; username: string | null; avatar_url: string | null }[])
      .map((p) => [p.id, p]),
  );
  const users = userIds.map((id) => profileMap.get(id)).filter(Boolean);

  // ── Organizer followers (organizer_follows → organizers) ─────────────────
  const { data: orgLinks } = await supabase
    .from("organizer_follows")
    .select("follower_organizer_id")
    .eq("followed_organizer_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const followerOrgIds = (orgLinks ?? []).map((r) => r.follower_organizer_id as string);

  const followerOrgs =
    followerOrgIds.length > 0
      ? ((await supabase
          .from("organizers")
          .select("id, name, slug, image_url, custom_image_url, type")
          .in("id", followerOrgIds)).data ?? [])
      : [];

  const orgMap = new Map(
    (followerOrgs as { id: string; name: string; slug: string | null; image_url: string | null; custom_image_url: string | null; type: string | null }[])
      .map((o) => [o.id, o]),
  );
  const orgs = followerOrgIds.map((id) => orgMap.get(id)).filter(Boolean);

  return NextResponse.json({ ok: true, users, orgs });
}

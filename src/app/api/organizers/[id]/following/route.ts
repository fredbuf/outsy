import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/organizers/[id]/following
// Returns organizers that this organizer follows (organizer_follows).
// Public — no auth required.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId))
    return NextResponse.json({ ok: false, error: "Invalid ID." }, { status: 400 });

  const supabase = supabaseServer();

  const { data: links } = await supabase
    .from("organizer_follows")
    .select("followed_organizer_id")
    .eq("follower_organizer_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  const followedIds = (links ?? []).map((r) => r.followed_organizer_id as string);

  const followedOrgs =
    followedIds.length > 0
      ? ((await supabase
          .from("organizers")
          .select("id, name, slug, image_url, type")
          .in("id", followedIds)).data ?? [])
      : [];

  const orgMap = new Map(
    (followedOrgs as { id: string; name: string; slug: string | null; image_url: string | null; type: string | null }[])
      .map((o) => [o.id, o]),
  );
  // Return in insertion order (most recent first).
  const orgs = followedIds.map((id) => orgMap.get(id)).filter(Boolean);

  return NextResponse.json({ ok: true, orgs });
}

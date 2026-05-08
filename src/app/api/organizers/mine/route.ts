import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type OrganizerEntry = {
  organizerId: string;
  name: string;
  type: string;
  slug: string | null;
  image_url: string | null;
  custom_image_url: string | null;
  role: string;
};

// ── GET /api/organizers/mine ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to view your organizers." }, { status: 401 });
  }

  const supabase = supabaseServer();

  // ── Step 1: core membership query ──────────────────────────────────────────
  // Intentionally does NOT include custom_image_url here.
  // Adding new columns to the nested join string will break this query if
  // PostgREST's schema cache hasn't refreshed yet, which would silently
  // empty the entire org list and log the user out of their org identity.
  const { data, error } = await supabase
    .from("organizer_members")
    .select("role, organizers(id, name, type, slug, image_url)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET /api/organizers/mine]", error);
    return NextResponse.json({ ok: false, error: "Failed to load organizers." }, { status: 500 });
  }

  const base = (data ?? []).flatMap((row) => {
    const org = Array.isArray(row.organizers) ? row.organizers[0] : row.organizers;
    if (!org) return [];
    return [{
      organizerId: org.id as string,
      name: org.name as string,
      type: org.type as string,
      slug: (org.slug ?? null) as string | null,
      image_url: (org.image_url ?? null) as string | null,
      role: row.role as string,
    }];
  });

  // ── Step 2: enrich with custom_image_url ────────────────────────────────────
  // Separate query so a schema-cache miss (PGRST204) never affects org visibility.
  const orgIds = base.map((o) => o.organizerId);
  const customImageMap = new Map<string, string | null>();
  if (orgIds.length > 0) {
    const { data: customRows } = await supabase
      .from("organizers")
      .select("id, custom_image_url")
      .in("id", orgIds);
    for (const row of (customRows ?? []) as { id: string; custom_image_url?: string | null }[]) {
      customImageMap.set(row.id, row.custom_image_url ?? null);
    }
  }

  const organizers: OrganizerEntry[] = base.map((o) => ({
    ...o,
    custom_image_url: customImageMap.get(o.organizerId) ?? null,
  }));

  return NextResponse.json({ ok: true, organizers });
}

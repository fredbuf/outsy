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
  role: string;
};

// ── GET /api/organizers/mine ──────────────────────────────────────────────────

export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in to view your organizers." }, { status: 401 });
  }

  const supabase = supabaseServer();

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

  const organizers: OrganizerEntry[] = (data ?? []).flatMap((row) => {
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

  return NextResponse.json({ ok: true, organizers });
}

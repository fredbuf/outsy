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

// ── DELETE /api/organizers/[id]/members/[userId] ──────────────────────────────
// owner only. Remove a member.
// Cannot remove the last remaining owner.

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id, userId } = await params;

  if (!UUID_RE.test(id))
    return NextResponse.json({ ok: false, error: "Invalid organizer ID." }, { status: 400 });
  if (!UUID_RE.test(userId))
    return NextResponse.json({ ok: false, error: "Invalid user ID." }, { status: 400 });

  const user = await getAuthUser(req);
  if (!user)
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const supabase = supabaseServer();

  // Verify caller is an active owner.
  const { data: callerMembership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", id)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  if (!callerMembership)
    return NextResponse.json({ ok: false, error: "Only owners can remove members." }, { status: 403 });

  // Fetch the target member's current role.
  const { data: targetMembership } = await supabase
    .from("organizer_members")
    .select("role, status")
    .eq("organizer_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!targetMembership)
    return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });

  // If the target is an active owner, check there is at least one other active owner.
  if (targetMembership.role === "owner" && targetMembership.status === "active") {
    const { count } = await supabase
      .from("organizer_members")
      .select("*", { count: "exact", head: true })
      .eq("organizer_id", id)
      .eq("role", "owner")
      .eq("status", "active");

    if ((count ?? 0) <= 1)
      return NextResponse.json(
        { ok: false, error: "Cannot remove the last owner. Transfer ownership first." },
        { status: 409 },
      );
  }

  const { error: deleteError } = await supabase
    .from("organizer_members")
    .delete()
    .eq("organizer_id", id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("[DELETE /api/organizers/[id]/members/[userId]]", deleteError);
    return NextResponse.json({ ok: false, error: "Failed to remove member. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

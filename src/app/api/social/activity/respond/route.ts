import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST /api/social/activity/respond
// Body: { friendshipId: string, action: "accept" | "ignore" }
// Only the recipient of the request may respond to it.
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { friendshipId, action } = body as Record<string, unknown>;

  if (typeof friendshipId !== "string" || !friendshipId.trim()) {
    return NextResponse.json({ ok: false, error: "friendshipId is required." }, { status: 400 });
  }
  if (action !== "accept" && action !== "ignore") {
    return NextResponse.json({ ok: false, error: "action must be 'accept' or 'ignore'." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify the row exists and current user is the recipient
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id,recipient_id,status")
    .eq("id", friendshipId)
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
  }
  if (friendship.recipient_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  }
  if (friendship.status !== "pending") {
    return NextResponse.json({ ok: false, error: "Request already resolved." }, { status: 409 });
  }

  if (action === "accept") {
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", friendshipId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, result: "accepted" });
  }

  // ignore → delete the row so they can re-request later if needed
  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("id", friendshipId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: "ignored" });
}

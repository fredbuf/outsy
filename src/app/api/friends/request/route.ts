import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function getAuthUser(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const {
    data: { user },
    error,
  } = await supabaseServer().auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// POST /api/friends/request
// Body: { recipientId: string }
// Requires: Authorization: Bearer <token>
//
// Behaviour:
//   - No existing row   → insert pending row, return { friendshipStatus: 'sent' }
//   - Caller already sent a pending request → return { friendshipStatus: 'sent' } (idempotent)
//   - Recipient already sent caller a request → accept it (mutual), return { friendshipStatus: 'friends' }
//   - Either side accepted → return { friendshipStatus: 'friends' } (idempotent)
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

  const { recipientId } = body as Record<string, unknown>;
  if (typeof recipientId !== "string" || !recipientId.trim()) {
    return NextResponse.json({ ok: false, error: "recipientId is required." }, { status: 400 });
  }

  if (recipientId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot add yourself." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Verify the recipient exists
  const { data: recipient } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", recipientId)
    .maybeSingle();
  if (!recipient) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  // Look for an existing friendship in either direction
  const { data: existing } = await supabase
    .from("friendships")
    .select("id,requester_id,status")
    .or(
      `and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") {
      // Already friends — idempotent
      return NextResponse.json({ ok: true, friendshipStatus: "friends" });
    }

    if (existing.requester_id === user.id) {
      // Caller already sent a pending request — idempotent
      return NextResponse.json({ ok: true, friendshipStatus: "sent" });
    }

    // Recipient had sent caller a pending request → accept it (mutual)
    const { error: updateError } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", existing.id);
    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, friendshipStatus: "friends" });
  }

  // No existing row → create new pending request
  const { error: insertError } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, recipient_id: recipientId, status: "pending" });
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, friendshipStatus: "sent" });
}

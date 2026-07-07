import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/supabase-server";
import { createNotification } from "@/lib/notifications";

// Validates shape only — the value is used untrimmed, as before.
const FriendRequestBody = z.object({
  recipientId: z
    .string({ error: "recipientId is required." })
    .refine((s) => s.trim().length > 0, { error: "recipientId is required." }),
});

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

  const parsed = FriendRequestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request body.",
        details: parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "body"}: ${issue.message}`
        ),
      },
      { status: 400 }
    );
  }
  const { recipientId } = parsed.data;

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

    // Notify the original requester that their request was accepted
    await createNotification({
      userId: existing.requester_id as string,
      type: "friend_request_accepted",
      actorId: user.id,
      entityId: existing.id as string,
    });

    return NextResponse.json({ ok: true, friendshipStatus: "friends" });
  }

  // No existing row → create new pending request
  const { data: inserted, error: insertError } = await supabase
    .from("friendships")
    .insert({ requester_id: user.id, recipient_id: recipientId, status: "pending" })
    .select("id")
    .single();
  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  // Notify the recipient of the new friend request
  await createNotification({
    userId: recipientId,
    type: "friend_request_received",
    actorId: user.id,
    entityId: inserted.id as string,
  });

  return NextResponse.json({ ok: true, friendshipStatus: "sent", friendshipId: inserted.id });
}

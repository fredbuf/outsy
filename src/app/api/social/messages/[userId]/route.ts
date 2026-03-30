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

export type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

// GET /api/social/messages/[userId]
// Returns messages between the authenticated user and userId, oldest first.
// Also returns the other user's profile.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId: otherId } = await params;
  if (otherId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot message yourself." }, { status: 400 });
  }

  const supabase = supabaseServer();

  const [messagesResult, profileResult] = await Promise.all([
    supabase
      .from("messages")
      .select("id,sender_id,body,created_at")
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true })
      .limit(100),

    supabase
      .from("profiles")
      .select("id,display_name,username,avatar_url")
      .eq("id", otherId)
      .maybeSingle(),
  ]);

  // Surface table-not-found clearly so the developer knows to run the migration.
  // Raw Supabase message: "Could not find the table public.messages in the schema cache"
  if (messagesResult.error) {
    return NextResponse.json({ ok: false, error: messagesResult.error.message }, { status: 500 });
  }

  if (!profileResult.data) {
    return NextResponse.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    messages: (messagesResult.data ?? []) as MessageRow[],
    otherUser: profileResult.data,
  });
}

// POST /api/social/messages/[userId]
// Body: { body: string }
// Sends a message to userId. Sender and recipient must be friends.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { userId: recipientId } = await params;
  if (recipientId === user.id) {
    return NextResponse.json({ ok: false, error: "Cannot message yourself." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const { body: msgBody } = body as Record<string, unknown>;
  if (typeof msgBody !== "string" || !msgBody.trim()) {
    return NextResponse.json({ ok: false, error: "body is required." }, { status: 400 });
  }
  if (msgBody.length > 2000) {
    return NextResponse.json({ ok: false, error: "Message too long (max 2000 chars)." }, { status: 400 });
  }

  const supabase = supabaseServer();

  // Require friendship — only friends can message each other
  const { data: friendship } = await supabase
    .from("friendships")
    .select("id")
    .or(
      `and(requester_id.eq.${user.id},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${user.id})`
    )
    .eq("status", "accepted")
    .maybeSingle();

  if (!friendship) {
    return NextResponse.json(
      { ok: false, error: "You can only message friends." },
      { status: 403 }
    );
  }

  const { data: newMessage, error: insertError } = await supabase
    .from("messages")
    .insert({ sender_id: user.id, recipient_id: recipientId, body: msgBody.trim() })
    .select("id,sender_id,body,created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: newMessage as MessageRow });
}

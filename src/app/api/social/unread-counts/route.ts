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

// GET /api/social/unread-counts
// Returns { activity: number, messages: number } — lightweight, used by the header dot.
// messages count is a proxy: conversations where the most recent message is from the other person.
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseServer();

  const [notifResult, msgResult] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false),
    supabase
      .from("messages")
      .select("sender_id,recipient_id,created_at,read_at")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const activityCount = notifResult.count ?? 0;

  // Group by conversation partner; count threads where the latest message is an
  // incoming (from them) message that hasn't been read yet (read_at IS NULL).
  let messagesCount = 0;
  if (msgResult.data && msgResult.data.length > 0) {
    const seenPartners = new Set<string>();
    for (const msg of msgResult.data) {
      const otherId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
      if (seenPartners.has(otherId)) continue;
      seenPartners.add(otherId);
      // This is the latest message for this partner; count if incoming + unread.
      const isIncoming = msg.sender_id !== user.id;
      const isUnread = msg.read_at == null;
      if (isIncoming && isUnread) messagesCount++;
    }
  }

  return NextResponse.json({ ok: true, activity: activityCount, messages: messagesCount });
}

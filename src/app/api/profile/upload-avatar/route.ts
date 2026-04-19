import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const BUCKET = "event-images";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to upload." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided." }, { status: 400 });
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { ok: false, error: "Only JPG, PNG, and WebP images are accepted." },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Avatar must be 2 MB or smaller." },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // One avatar per user — path keyed by user ID, upsert replaces the previous file.
  const path = `avatars/${user.id}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Append a timestamp so each upload gets a distinct URL — busts the browser
  // cache even though the storage path is unchanged (upsert replaces in place).
  const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  // 1. Update the profiles table (authoritative source for profile data).
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  // 2. Mirror the new URL into Supabase Auth user_metadata so that components
  //    reading user.user_metadata.avatar_url (e.g. AppTopBar) stay in sync.
  //    The client must call supabase.auth.refreshSession() after this to pick
  //    up the change — see profile/page.tsx handleAvatarChange.
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { avatar_url: avatarUrl },
  });

  return NextResponse.json({ ok: true, url: avatarUrl });
}

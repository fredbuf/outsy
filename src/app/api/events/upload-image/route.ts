import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "event-images";

export async function POST(req: Request) {
  console.log("[upload-image] route hit");

  // Auth check
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to upload images." }, { status: 401 });
  }
  const { data: { user: authUser }, error: authError } = await supabaseServer().auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "Invalid session. Please sign in again." }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0].trim();
  console.log("[upload-image] content-type:", contentType, "mimeType:", mimeType);

  if (!ALLOWED_MIME.has(mimeType)) {
    console.log("[upload-image] rejected mime type:", mimeType);
    return NextResponse.json(
      { ok: false, error: "Only JPG, PNG, and WebP images are accepted." },
      { status: 400 }
    );
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await req.arrayBuffer();
  } catch (e) {
    console.error("[upload-image] arrayBuffer() threw:", e);
    return NextResponse.json({ ok: false, error: "Could not read image data." }, { status: 400 });
  }

  console.log("[upload-image] body byteLength:", arrayBuffer.byteLength);

  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
  }

  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image must be 5 MB or smaller." },
      { status: 400 }
    );
  }

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `events/${crypto.randomUUID()}.${ext}`;
  console.log("[upload-image] storage path:", path, "contentType:", mimeType);

  const supabase = supabaseServer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: false });

  if (error) {
    console.error("[upload-image] Supabase storage error:", error.message);
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  console.log("[upload-image] success, publicUrl:", urlData.publicUrl);

  return NextResponse.json({ ok: true, url: urlData.publicUrl });
}

import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = "event-images";

export async function POST(req: Request) {
  // Auth check
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to upload images." }, { status: 401 });
  }
  const { data: { user: authUser }, error: authError } = await supabaseServer().auth.getUser(token);
  if (authError || !authUser) {
    return NextResponse.json({ ok: false, error: "Invalid session. Please sign in again." }, { status: 401 });
  }

  // Accept raw binary body with content-type header.
  // Previously used multipart/form-data but iOS WebKit (both Safari and Chrome/WKWebView)
  // silently fails to serialise FormData/Blob bodies in some cases — returning a
  // status-0 error Response instead of throwing, so .json() then calls new URL("")
  // internally and throws "The string did not match the expected pattern".
  const contentType = req.headers.get("content-type") ?? "";
  const mimeType = contentType.split(";")[0].trim();

  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json(
      { ok: false, error: "Only JPG, PNG, and WebP images are accepted." },
      { status: 400 }
    );
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await req.arrayBuffer();
  } catch {
    return NextResponse.json({ ok: false, error: "Could not read image data." }, { status: 400 });
  }

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

  const supabase = supabaseServer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: mimeType, upsert: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ ok: true, url: urlData.publicUrl });
}

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
      { ok: false, error: "Image must be 5 MB or smaller." },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `events/${crypto.randomUUID()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const supabase = supabaseServer();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return NextResponse.json({ ok: true, url: urlData.publicUrl });
}

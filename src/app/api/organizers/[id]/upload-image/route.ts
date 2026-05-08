import "server-only";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const BUCKET = "event-images";

// POST /api/organizers/[id]/upload-image
// Uploads an image for the organizer and writes it to custom_image_url.
// Requires owner or admin membership.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: orgId } = await params;
  if (!UUID_RE.test(orgId)) {
    return NextResponse.json({ ok: false, error: "Invalid organizer id." }, { status: 400 });
  }

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ ok: false, error: "Sign in to upload." }, { status: 401 });
  }

  const supabase = supabaseServer();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Invalid session." }, { status: 401 });
  }

  // Verify membership: only owner / admin may change the logo.
  const { data: membership } = await supabase
    .from("organizer_members")
    .select("role")
    .eq("organizer_id", orgId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { ok: false, error: "You don't have permission to edit this organizer." },
      { status: 403 },
    );
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
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Image must be 4 MB or smaller." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ ok: false, error: "File is empty." }, { status: 400 });
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // One image per org — path keyed by org ID; upsert replaces the previous file.
  const path = `org-images/${orgId}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json(
      { ok: false, error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Timestamp bust ensures browser cache is invalidated on each upload.
  const imageUrl = `${urlData.publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("organizers")
    .update({ custom_image_url: imageUrl })
    .eq("id", orgId);

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: imageUrl });
}

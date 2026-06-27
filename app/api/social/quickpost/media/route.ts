import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { getMyCompany } from "@/lib/supabase/store";
import { createServiceClient } from "@/lib/supabase/server";
import { generateBrandedImage, imageGenConfigured } from "@/lib/image";

export const dynamic = "force-dynamic";

const BUCKET = "social-images";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB (covers short videos)
const OK_IMAGE = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const OK_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

// POST — attach media for a quick post. Two modes:
//   multipart/form-data with `file`  → upload a user image/video, return its URL
//   application/json { generate:true, text } → AI-generate an on-brand image
// Returns { url, kind } where kind is "image" | "video".
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const companyId = String(mine.id);
  const svc = createServiceClient();
  const contentType = req.headers.get("content-type") || "";

  // --- AI image generation ---
  if (contentType.includes("application/json")) {
    if (!imageGenConfigured()) {
      return NextResponse.json({ error: "AI image generation isn't configured on this deployment." }, { status: 503 });
    }
    const { db } = await getStore();
    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").slice(0, 1500);
    // Optional brand-color hint from the client (e.g. "navy blue and red"); falls
    // back to undefined so the prompt uses its sophisticated default palette.
    const brandColors = (typeof body?.brandColors === "string" && body.brandColors.trim() ? body.brandColors.trim() : db.company.brandColors || "").slice(0, 120) || undefined;
    // `variant` rotates the composition so re-generating gives a different image.
    const variant = Number.isFinite(body?.variant) ? Number(body.variant) : 0;
    const postId = `quick-${randomId()}`;

    // Layout picker: announcement | stat | quote | filing. Each uses different
    // fields; sensible defaults fall back to the post text.
    const LAYOUTS = ["announcement", "stat", "quote", "filing"] as const;
    const layout = (LAYOUTS as readonly string[]).includes(body?.layout) ? body.layout : "announcement";
    const headline = String(body?.title ?? text).split(/\n/)[0].slice(0, 120) || db.company.name;
    const label = typeof body?.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 60)
      : layout === "filing" ? "8-K" : layout === "stat" ? "Highlight" : "Investor Update";
    const subBody = typeof body?.body === "string" ? body.body.trim().slice(0, 200) : undefined;

    const url = await generateBrandedImage({
      companyId,
      postId,
      ticker: db.company.ticker,
      company: db.company.name,
      theme: db.company.sector || "investor relations",
      brandColors,
      layout,
      label,
      title: headline,
      body: subBody,
      variant,
    });
    if (!url) return NextResponse.json({ error: "Couldn't generate an image. Try again or upload one." }, { status: 502 });
    return NextResponse.json({ url, kind: "image" });
  }

  // --- user upload (image or video) ---
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 422 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File is too large (max 50MB)." }, { status: 413 });

  const type = file.type;
  const isImage = OK_IMAGE.includes(type);
  const isVideo = OK_VIDEO.includes(type);
  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Unsupported file type. Use PNG/JPG/WebP/GIF or MP4/MOV/WebM." }, { status: 415 });
  }

  const ext = type.split("/")[1]?.replace("quicktime", "mov") || (isVideo ? "mp4" : "png");
  const path = `${companyId}/quick-${randomId()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: type, upsert: true });
  if (error) return NextResponse.json({ error: "Upload failed. Try again." }, { status: 502 });
  const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) return NextResponse.json({ error: "Couldn't get the file URL." }, { status: 502 });
  return NextResponse.json({ url: data.publicUrl, kind: isVideo ? "video" : "image" });
}

// Avoids Math.random ban concerns elsewhere — fine in a request handler.
function randomId(): string {
  return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
}

import { NextResponse } from "next/server";
import { getMyCompany, getMyRole, updateMyCompany } from "@/lib/supabase/store";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BUCKET = "social-images"; // reuse the existing public bucket
const MAX = 4 * 1024 * 1024; // 4MB
const OK = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

// POST multipart { file } — upload the company logo, save its URL on the company.
// Admin-only (company-wide setting).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if ((await getMyRole()) !== "admin") {
    return NextResponse.json({ error: "Only company admins can change the logo." }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded." }, { status: 422 });
  if (file.size > MAX) return NextResponse.json({ error: "Logo is too large (max 4MB)." }, { status: 413 });
  if (!OK.includes(file.type)) return NextResponse.json({ error: "Use PNG, JPG, WebP, or SVG." }, { status: 415 });

  const ext = file.type === "image/svg+xml" ? "svg" : (file.type.split("/")[1] || "png");
  const path = `${mine.id}/logo.${ext}`;
  const svc = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: true });
  if (error) return NextResponse.json({ error: "Upload failed. Try again." }, { status: 502 });
  // Cache-bust the public URL so an updated logo shows immediately.
  const base = svc.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl;
  if (!base) return NextResponse.json({ error: "Couldn't get the logo URL." }, { status: 502 });
  const logoUrl = `${base}?v=${buffer.length}`;
  await updateMyCompany({ logoUrl });
  return NextResponse.json({ logoUrl });
}

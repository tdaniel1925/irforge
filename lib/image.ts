import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "./supabase/server";
import { renderPostTemplate } from "./postTemplate";

// AI image generation for social posts (Gemini) + upload to Supabase Storage.
// Best-effort: if GEMINI_API_KEY is missing or generation fails, returns null so
// a post is never blocked on an image. Ported from the PrismGraphs pipeline.

const BUCKET = "social-images";

export function imageGenConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Generate raw image bytes from a prompt (Gemini). Returns the PNG Buffer or null.
export async function generateImageBuffer(prompt: string): Promise<Buffer | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const genai = new GoogleGenAI({ apiKey: key });
    const response = await genai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        // 1K is plenty for social feeds (X/LinkedIn downscale anyway) — faster + cheaper than 2K.
        responseFormat: { image: { aspectRatio: "1:1", imageSize: "1K" } },
      } as Record<string, unknown>,
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      if (p.inlineData?.data) return Buffer.from(p.inlineData.data, "base64");
    }
    return null;
  } catch {
    return null;
  }
}

// Upload a PNG buffer to the bucket; returns its public URL or null.
async function uploadPng(companyId: string, postId: string, buffer: Buffer): Promise<string | null> {
  const svc = createServiceClient();
  const path = `${companyId}/${postId}.png`;
  const { error } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true });
  if (error) return null;
  return svc.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null;
}

// Generate an image for a post and upload it; returns the public URL or null.
export async function generatePostImage(opts: {
  companyId: string;
  postId: string;
  prompt: string;
}): Promise<string | null> {
  const buffer = await generateImageBuffer(opts.prompt);
  if (!buffer) return null;
  return uploadPng(opts.companyId, opts.postId, buffer);
}

// ── Branded template images ──────────────────────────────────────────────────
// A two-layer image: an AI-generated BACKGROUND (no text/logo) composited under a
// branded template (real logo mark + crisp text) via the next/og /template route.
// This is how we get the on-brand "infographic/tech report" look with ACCURATE text
// and an exact logo — things raw AI image generation can't do.

// Background-only prompt: atmospheric, brand-colored backdrop with NO central subject
// (the template's text panel sits on top), so text stays readable.
export function buildBackgroundPrompt(opts: { theme: string; brandColors?: string }): string {
  const palette = opts.brandColors?.trim()
    ? `built around the brand colors ${opts.brandColors}`
    : "a deep navy palette with one bold accent and luminous highlights";
  return (
    `A clean, modern, infographic-style ABSTRACT BACKGROUND graphic — flat/semi-flat vector with subtle geometric tech patterns (thin connector lines, diamonds, faint circuit/orbit motifs), soft gradients and gentle depth. ` +
    `Palette: ${palette}. Theme/mood: ${opts.theme}. ` +
    `Composition: keep the CENTER and LEFT area calm and uncluttered (negative space for an overlay) with visual interest toward the edges/corners. ` +
    `Hard constraints: NO words, letters, numbers, charts, graphs, logos, people, or recognizable real objects — pure abstract branded backdrop only. No watermarks. ` +
    `Square 1:1, crisp, optimized as a social-post background.`
  );
}

export interface BrandedImageInput {
  companyId: string;
  postId: string;
  ticker: string;
  company: string;
  theme: string;
  brandColors?: string;
  layout?: "announcement" | "stat" | "quote" | "filing";
  title: string;       // headline / stat value / quote
  body?: string;       // supporting line
  label?: string;      // small label (stat label / attribution / filing form)
  variant?: number;
}

const isPngBuffer = (b: Buffer) => b.length > 1000 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

// Our PUBLIC origin for the self-fetch fallback. NEVER VERCEL_URL — that's the
// per-deployment URL behind Vercel's auth wall (returns an HTML login page that gets
// saved as a ".png" → broken images). Use the public production domain.
const PUBLIC_SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "https://pubcozone.com";

// Generate a fully branded template image and upload it. Returns the public URL, or
// null on any failure (caller falls back to a plain image / no image).
export async function generateBrandedImage(input: BrandedImageInput): Promise<string | null> {
  const opts = {
    layout: input.layout ?? "announcement",
    ticker: input.ticker,
    company: input.company,
    title: input.title,
    body: input.body ?? undefined,
    label: input.label ?? undefined,
  };

  // 1) Preferred: render the template IN-PROCESS (no HTTP, no auth wall). If next/og
  //    can't run here, fall through to the HTTP fallback.
  try {
    const res = renderPostTemplate(opts);
    const png = Buffer.from(await res.arrayBuffer());
    if (isPngBuffer(png)) return uploadPng(input.companyId, `${input.postId}-branded`, png);
  } catch { /* fall back to the HTTP render */ }

  // 2) Fallback: fetch the template route on the PUBLIC domain (verified to return a
  //    real PNG). Validate the PNG header so an HTML error page is never saved.
  try {
    const res = await fetch(`${PUBLIC_SITE}/api/social/template`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000), body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    const png = Buffer.from(await res.arrayBuffer());
    if (!isPngBuffer(png)) return null;
    return uploadPng(input.companyId, `${input.postId}-branded`, png);
  } catch {
    return null;
  }
}

// Build a compliant, CINEMATIC, on-brand image prompt from the post text + company.
// Real art direction (lighting, mood, lens, materials) is what separates a striking
// image from a stale stock-photo look — while still avoiding charts/numbers/financial
// claims for compliance.
//
// `brandColors` biases the palette toward the company's brand (falls back to a
// sophisticated default). `variant` lets callers vary the composition so repeated
// generations don't all look identical.
export function buildImagePrompt(opts: {
  companyName: string;
  ticker: string;
  theme: string;
  postText: string;
  brandColors?: string;
  variant?: number;
}): string {
  const snippet = opts.postText.slice(0, 280).replace(/\s+/g, " ").trim();
  const palette = opts.brandColors?.trim()
    ? `Color palette: built around the brand colors ${opts.brandColors} — used as dramatic accent light and material color, not flat fills.`
    : `Color palette: a sophisticated, restrained palette with one bold accent color; deep tones with luminous highlights.`;

  // A few layout framings so successive images feel distinct, not cloned.
  const compositions = [
    "a central hero icon motif with clean geometric panels radiating outward",
    "a balanced grid of related vector icon motifs connected by subtle flow lines",
    "a single bold iconographic centerpiece on a layered geometric backdrop",
    "an asymmetric modern layout with one large motif and supporting accent shapes",
    "a connected node/flow arrangement of sleek icon motifs",
  ];
  const composition = compositions[(opts.variant ?? 0) % compositions.length];

  return (
    `A polished, modern INFOGRAPHIC-STYLE brand graphic for ${opts.companyName} ($${opts.ticker}) — flat/semi-flat vector design, the kind of clean corporate infographic you'd see in a premium pitch deck or SaaS landing page. ` +
    `Concept: represent the IDEA of "${snippet}" (theme: ${opts.theme}) through sleek symbolic ICONS and abstract shapes — NOT literal text. ` +
    `Layout: ${composition}. ` +
    `Style: crisp flat-design vector icons with subtle gradients and soft long shadows, rounded geometric panels/cards, a layered tech-pattern background (thin lines, diamonds, circuit/flow motifs), tasteful highlights — bright, confident, professional, highly polished. ` +
    `Depth: clean and graphic (vector/illustration), NOT photographic — sharp edges, even studio lighting, no photo grain. ` +
    `${palette} ` +
    `Hard constraints: absolutely NO words, letters, numbers, charts, graphs, percentages, price figures, tickers, fabricated logos, fake quotes, lorem ipsum, or anything that states or implies a stock price, valuation, prediction, or financial return. Icons and shapes ONLY — no readable text anywhere. No watermarks. ` +
    `Square 1:1, crisp and beautiful, optimized for X and LinkedIn feeds.`
  );
}

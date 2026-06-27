import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "./supabase/server";

// AI image generation for social posts (Gemini) + upload to Supabase Storage.
// Best-effort: if GEMINI_API_KEY is missing or generation fails, returns null so
// a post is never blocked on an image. Ported from the PrismGraphs pipeline.

const BUCKET = "social-images";

export function imageGenConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Generate an image for a post and upload it; returns the public URL or null.
export async function generatePostImage(opts: {
  companyId: string;
  postId: string;
  prompt: string;
}): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  try {
    const genai = new GoogleGenAI({ apiKey: key });
    const response = await genai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
      config: {
        // 1K is plenty for social feeds (X/LinkedIn downscale anyway) — faster + cheaper than 2K.
        responseFormat: { image: { aspectRatio: "1:1", imageSize: "1K" } },
      } as Record<string, unknown>,
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    let buffer: Buffer | null = null;
    for (const p of parts) {
      if (p.inlineData?.data) {
        buffer = Buffer.from(p.inlineData.data, "base64");
        break;
      }
    }
    if (!buffer) return null;

    const svc = createServiceClient();
    const path = `${opts.companyId}/${opts.postId}.png`;
    const { error } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: "image/png", upsert: true });
    if (error) return null;
    const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? null;
  } catch {
    return null;
  }
}

// ── Branded template images ──────────────────────────────────────────────────
// A two-layer image: an AI-generated BACKGROUND (no text/logo) composited under a
// branded template (real logo mark + crisp text) via the next/og /template route.
// This is how we get the on-brand "infographic/tech report" look with ACCURATE text
// and an exact logo — things raw AI image generation can't do.

// Resolve our own origin for the server-to-server call to the template route.
// Prefer an explicit site URL, then the Vercel deployment URL (preview/prod), then
// the known prod domain as a last resort.
const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
  "https://pubcozone.com";

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

// Generate a fully branded template image and upload it. Returns the public URL, or
// null on any failure (caller falls back to a plain image / no image).
export async function generateBrandedImage(input: BrandedImageInput): Promise<string | null> {
  try {
    // 1) AI background (best-effort — template still renders on a brand gradient if null).
    let bgUrl: string | null = null;
    if (imageGenConfigured()) {
      const prompt = buildBackgroundPrompt({ theme: input.theme, brandColors: input.brandColors });
      bgUrl = await generatePostImage({ companyId: input.companyId, postId: `${input.postId}-bg`, prompt });
    }

    // 2) Composite via the next/og template route.
    const u = new URL(`${SITE}/api/social/template`);
    if (bgUrl) u.searchParams.set("bg", bgUrl);
    u.searchParams.set("layout", input.layout ?? "announcement");
    u.searchParams.set("ticker", input.ticker);
    u.searchParams.set("company", input.company);
    u.searchParams.set("title", input.title);
    if (input.body) u.searchParams.set("body", input.body);
    if (input.label) u.searchParams.set("label", input.label);

    const res = await fetch(u.toString(), { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return bgUrl; // fall back to the bare background if compositing fails
    const png = Buffer.from(await res.arrayBuffer());

    // 3) Upload the final composite.
    const svc = createServiceClient();
    const path = `${input.companyId}/${input.postId}-branded.png`;
    const { error } = await svc.storage.from(BUCKET).upload(path, png, { contentType: "image/png", upsert: true });
    if (error) return bgUrl;
    const { data } = svc.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl ?? bgUrl;
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

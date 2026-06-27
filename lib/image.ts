import { GoogleGenAI } from "@google/genai";
import { createServiceClient } from "./supabase/server";

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

// Detect the real image format from the buffer's magic bytes. Gemini returns JPEG
// (not PNG), so labeling everything image/png produced mislabeled files; this keeps
// the content-type + extension honest.
function detectImage(b: Buffer): { ext: string; mime: string } {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", mime: "image/png" };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (b.length > 12 && b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP") return { ext: "webp", mime: "image/webp" };
  return { ext: "png", mime: "image/png" }; // sensible default
}

// Upload an image buffer to the bucket with the CORRECT content-type/extension;
// returns its public URL or null. (Named uploadPng for history; handles any format.)
async function uploadPng(companyId: string, postId: string, buffer: Buffer): Promise<string | null> {
  const svc = createServiceClient();
  const { ext, mime } = detectImage(buffer);
  const path = `${companyId}/${postId}.${ext}`;
  const { error } = await svc.storage.from(BUCKET).upload(path, buffer, { contentType: mime, upsert: true });
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

// Generate a post image and upload it. Returns the public URL, or null on failure.
//
// Pure Gemini: we let the model generate a complete, striking image directly (no
// template/overlay). The post text + disclosures live in the post caption, so the
// image just needs to look great — `buildImagePrompt` gives it strong art direction.
// (Signature kept stable so existing callers — Quick Post, Content Engine — are
// unchanged; layout/label fields are ignored in the pure-Gemini path.)
export async function generateBrandedImage(input: BrandedImageInput): Promise<string | null> {
  if (!imageGenConfigured()) return null;
  const postText = input.title + (input.body ? `\n${input.body}` : "");

  // Ask the AI what to depict for THIS post, so the image is relevant (not a fixed
  // motif). Best-effort: if it's unavailable, buildImagePrompt uses a fallback subject.
  let concept: string | null = null;
  try {
    const { pickVisualConcept } = await import("./ai");
    concept = await pickVisualConcept(postText, { name: input.company, ticker: input.ticker, sector: input.theme } as never);
  } catch { /* fall back to a generic subject */ }

  const prompt = buildImagePrompt({
    companyName: input.company,
    ticker: input.ticker,
    theme: input.theme,
    postText,
    brandColors: input.brandColors,
    variant: input.variant,
    concept: concept ?? undefined,
  });
  const buffer = await generateImageBuffer(prompt);
  if (!buffer) return null;
  return uploadPng(input.companyId, `${input.postId}-branded`, buffer);
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
  concept?: string;   // AI-chosen visual subject for THIS post (so the image is relevant)
}): string {
  const snippet = opts.postText.slice(0, 280).replace(/\s+/g, " ").trim();

  // ── AMFN-ONLY brand style ──────────────────────────────────────────────────
  // This bespoke American Fusion look (navy + red, atom motifs) is ISOLATED to AMFN
  // and must NEVER apply to any other company. Normalize the ticker (trim + upper) so
  // stray whitespace/casing can't leak it. Every other company falls through to the
  // general style below.
  if (String(opts.ticker ?? "").trim().toUpperCase() === "AMFN") {
    const fallbacks = [
      "a striking visual that represents this announcement for an electric / fusion energy company",
      "a confident scene symbolizing progress and momentum in clean energy",
      "an aspirational image evoking innovation and forward motion",
    ];
    const subject = opts.concept?.trim() || fallbacks[(opts.variant ?? 0) % fallbacks.length];
    return (
      `A polished, premium social graphic for American Fusion (electric & fusion energy), in a consistent modern brand style. ` +
      `SUBJECT (what to depict, drawn from the post): ${subject}. The post is about: "${snippet}" (theme: ${opts.theme}). ` +
      `BRAND STYLE (keep this consistent across all images): a deep NAVY BLUE palette with strong RED accents and clean light/white space; sleek, polished, modern and professional; subtle atom/orbital motifs woven in as a recurring brand cue; crisp lighting, strong focal point, gallery-grade finish. ` +
      `The subject can be a real scene, people, objects, an illustration, or a stylized graphic — whatever best fits the post — but always rendered in the navy/red American Fusion look. ` +
      `COMPOSITION: full-bleed, edge-to-edge artwork that fills the ENTIRE frame. Absolutely NO borders, NO frames, NO outlines, NO colored margins or padding around the image, NO inner card/panel framing the whole scene — the artwork must extend to all four edges. ` +
      `HARD CONSTRAINTS: NO readable words, letters, numbers, charts, percentages, price figures, tickers, fake quotes, fabricated logos, or anything implying a stock price, valuation, or return. No text anywhere. No watermarks. ` +
      `Square 1:1, crisp and high-resolution for X and LinkedIn.`
    );
  }

  const palette = opts.brandColors?.trim()
    ? `Color palette: built around the brand colors ${opts.brandColors} — used as dramatic accent light, glow, and material color (not flat fills).`
    : `Color palette: a sophisticated, restrained palette with one bold accent color; deep rich tones with luminous highlights.`;

  // Vary the look so repeated generations don't all look the same.
  const styles = [
    "a cinematic 3D render — sleek materials (glass, brushed metal, soft matte), dramatic studio lighting, shallow depth of field, premium product-shot feel",
    "a bold editorial illustration — clean confident shapes, modern flat-with-depth vector art, strong focal point, magazine-cover polish",
    "an atmospheric conceptual scene — volumetric light, soft haze, glowing accents, a single striking metaphor, aspirational mood",
    "a premium isometric/3D scene — crisp geometric forms, gentle gradients, soft long shadows, modern tech aesthetic",
    "a dynamic abstract composition — flowing forms, light streaks, depth and motion, elegant and high-end",
  ];
  const style = styles[(opts.variant ?? 0) % styles.length];

  return (
    `Create a STRIKING, premium, scroll-stopping social graphic for ${opts.companyName} ($${opts.ticker}) — the quality of a top brand's hero image or an Apple-keynote visual. ` +
    `Convey the FEELING and IDEA of "${snippet}" (theme: ${opts.theme}) through evocative imagery and metaphor — confident, modern, aspirational. ` +
    `Art direction: ${style}. ` +
    `${palette} ` +
    `Make it genuinely beautiful: strong focal point, rich detail, professional composition and lighting, clean negative space, gallery-grade finish. ` +
    `COMPOSITION: full-bleed, edge-to-edge artwork that fills the ENTIRE frame — NO borders, frames, outlines, colored margins, or card framing around the image. ` +
    `HARD CONSTRAINTS (critical): absolutely NO words, letters, numbers, charts, graphs, percentages, price figures, tickers, fabricated logos, fake quotes, or anything that states or implies a stock price, valuation, prediction, or financial return. No readable text anywhere. No watermarks. No real people's faces. ` +
    `Square 1:1, crisp and high-resolution, optimized for X and LinkedIn feeds.`
  );
}

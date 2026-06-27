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

  // A few composition framings so successive images feel distinct, not cloned.
  const compositions = [
    "a single hero subject lit from one dramatic angle, deep shadow falloff",
    "a sweeping wide establishing shot with strong atmospheric perspective",
    "an intimate macro detail with extreme shallow depth of field and bokeh",
    "a bold low-angle hero composition with light streaming from above",
    "a clean negative-space composition with the subject offset and rim-lit",
  ];
  const composition = compositions[(opts.variant ?? 0) % compositions.length];

  return (
    `Cinematic, premium, editorial-quality image for ${opts.companyName} ($${opts.ticker}) — the kind of striking visual you'd see in a high-end brand film or Apple keynote. ` +
    `Concept: evoke the FEELING of "${snippet}" (theme: ${opts.theme}) through atmosphere and metaphor — NOT literal text or logos. ` +
    `Composition: ${composition}. ` +
    `Lighting & mood: dramatic directional lighting, volumetric light, soft haze, rich contrast between glowing highlights and deep shadow; a cinematic, slightly moody, aspirational atmosphere. ` +
    `Craft: shot like premium photography or a high-end 3D render — shallow depth of field, tasteful bokeh, fine texture and material detail (glass, metal, light, natural elements), photorealistic or polished editorial-3D finish, no flat clip-art. ` +
    `${palette} ` +
    `Hard constraints: absolutely NO words, letters, numbers, charts, graphs, percentages, price figures, tickers, fabricated logos, fake quotes, or anything that states or implies a stock price, valuation, prediction, or financial return. No watermarks, no UI, no stock-photo cliché (no generic handshake/cityscape-with-arrows). ` +
    `Square 1:1, crisp and beautiful, optimized for X and LinkedIn feeds.`
  );
}

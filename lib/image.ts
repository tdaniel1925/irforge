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
        responseFormat: { image: { aspectRatio: "1:1", imageSize: "2K" } },
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

// Build a compliant, on-brand image prompt from the post text + company.
// Deliberately avoids charts/numbers (which could imply price/performance claims).
export function buildImagePrompt(opts: { companyName: string; ticker: string; theme: string; postText: string }): string {
  const snippet = opts.postText.slice(0, 280).replace(/\s+/g, " ").trim();
  return (
    `A clean, professional, modern corporate social-media graphic for ${opts.companyName} ($${opts.ticker}). ` +
    `Theme: ${opts.theme}. The post is about: "${snippet}". ` +
    `Style: minimal, premium, business-appropriate; abstract or conceptual imagery, brand-neutral palette, clear focal point, generous negative space. ` +
    `Do NOT include stock charts, price figures, percentages, fabricated logos, fake quotes, or any text that states or implies a stock price, valuation, prediction, or financial return. ` +
    `Square 1:1 composition suitable for X and LinkedIn.`
  );
}

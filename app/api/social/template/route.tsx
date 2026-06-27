import { renderPostTemplate, type TemplateOpts } from "@/lib/postTemplate";

export const runtime = "edge";

// Branded post-image route — thin wrapper around the shared renderer in
// lib/postTemplate. Kept for direct previews (open the URL in a browser) and any
// external callers. Server-side image generation calls renderPostTemplate DIRECTLY
// (no self-fetch) — see lib/image.ts.

function safeRender(o: TemplateOpts): Response {
  try {
    return renderPostTemplate(o);
  } catch (e) {
    return new Response(JSON.stringify({ error: "template render failed", detail: String(e).slice(0, 200) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return safeRender({
    bg: p.get("bg") || "", layout: p.get("layout") || "", ticker: p.get("ticker") || "",
    company: p.get("company") || "", title: p.get("title") || "", body: p.get("body") || "", label: p.get("label") || "",
  });
}

export async function POST(req: Request) {
  const o = (await req.json().catch(() => ({}))) as TemplateOpts;
  return safeRender(o);
}

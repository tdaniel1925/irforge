import { getBuzzCloud } from "@/lib/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const words = await getBuzzCloud();
    return Response.json(
      { ok: true, words },
      { headers: { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (e) {
    console.error("[buzz] failed:", e);
    return Response.json({ ok: false, words: [] }, { status: 200 });
  }
}

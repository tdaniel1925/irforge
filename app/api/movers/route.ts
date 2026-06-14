import { getBigMovers } from "@/lib/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const data = await getBigMovers();
    return Response.json(
      { ok: true, ...data },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=1800" } }
    );
  } catch (e) {
    console.error("[movers] failed:", e);
    return Response.json({ ok: false, gainers: [], losers: [], actives: [] }, { status: 200 });
  }
}

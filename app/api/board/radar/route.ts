import { NextResponse } from "next/server";
import { getBoardPage } from "@/lib/publicStats";
import { createServiceClient } from "@/lib/supabase/server";
import { computeManipulationSignals, describeManipulationRisk } from "@/lib/manipulationRadar";

export const dynamic = "force-dynamic";

// GET /api/board/radar?ticker=XXX
// Reads board posts (flags + authors + ts + memberId) and the company_stats row
// (volume_ratio + sentiment + short_pct), then returns a deterministic
// manipulation-pattern assessment. Investor-facing caution, never advice.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ticker = (u.searchParams.get("ticker") ?? "").toUpperCase().slice(0, 8);
  if (!ticker) return NextResponse.json({ error: "ticker required" }, { status: 422 });

  // (a) board posts — pull a wide page so 24h clustering is well-sampled.
  const { posts } = await getBoardPage(ticker, 0, 200);
  const radarPosts = posts.map((p) => ({
    author: p.author,
    flag: p.flag,
    ts: p.ts,
    memberId: p.memberId,
  }));

  // (b) company_stats row — tiny LOCAL query (no get-single-ticker helper exists yet).
  let stat:
    | { volume_ratio: number | null; bullish: number; bearish: number; short_pct: number | null }
    | undefined;
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("company_stats")
      .select("volume_ratio,bullish,bearish,short_pct")
      .eq("ticker", ticker)
      .maybeSingle();
    if (data) stat = data as typeof stat;
  } catch {
    /* stats optional — radar still works from posts alone */
  }

  const signals = computeManipulationSignals({ posts: radarPosts, stat });
  const { caption, engine } = await describeManipulationRisk(signals);

  return NextResponse.json({ ticker, ...signals, caption, engine });
}

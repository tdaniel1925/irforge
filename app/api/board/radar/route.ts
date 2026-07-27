import { NextResponse } from "next/server";
import { getBoardPage, rateAllow } from "@/lib/publicStats";
import { createServiceClient } from "@/lib/supabase/server";
import { computeManipulationSignals, describeManipulationRisk } from "@/lib/manipulationRadar";
import { computeSentimentComposite } from "@/lib/sentimentComposite";

export const dynamic = "force-dynamic";

// GET /api/board/radar?ticker=XXX
// Reads board posts (flags + authors + ts + memberId) and the company_stats row
// (volume_ratio + sentiment + short_pct), then returns a deterministic
// manipulation-pattern assessment. Investor-facing caution, never advice.
export async function GET(req: Request) {
  // Public + invokes a paid AI caption per call — rate-limit per IP (the same
  // shared bucket truth-check uses) AND per ticker so a rotating-IP scraper
  // can't fan out across tickers. On Vercel x-forwarded-for's first hop is
  // platform-set (not client-spoofable); worst case a spoofer only throttles
  // themselves into the shared per-ticker bucket.
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon").trim();
  const u = new URL(req.url);
  const ticker = (u.searchParams.get("ticker") ?? "").toUpperCase().slice(0, 8);
  if (!ticker || !/^[A-Z0-9.-]{1,8}$/.test(ticker)) return NextResponse.json({ error: "ticker required" }, { status: 422 });
  if (!(await rateAllow(`radar:${ip}`, 20)) || !(await rateAllow(`radar:t:${ticker}`, 60))) {
    return NextResponse.json({ error: "Rate limited — try again in a minute." }, { status: 429 });
  }

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

  // Community signal: what the AI labels say about the last 7 days of posting.
  // Pure counts — readers see the mix (factual vs opinion vs hype vs fud) at a glance.
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const mix7d = { factual: 0, opinion: 0, hype: 0, fud: 0, chatter: 0, question: 0, verified: 0, total: 0 };
  for (const p of posts) {
    const t = new Date(p.ts).getTime();
    if (!isFinite(t) || t < week) continue;
    const f = (p.verified ? "verified" : p.flag || "chatter") as keyof typeof mix7d;
    if (f in mix7d) mix7d[f]++;
    mix7d.total++;
  }

  // Descriptive multi-factor sentiment snapshot (never predictive). Question
  // answered-rate comes from the same page of posts: root questions vs verified replies.
  const roots = posts.filter((p) => p.flag === "question" && !p.parentId);
  const answeredIds = new Set(posts.filter((p) => p.verified && p.parentId).map((p) => p.parentId));
  const answeredQuestions = roots.filter((q) => answeredIds.has(q.id)).length;
  const composite = computeSentimentComposite({
    mix: mix7d,
    stat,
    openQuestions: roots.length - answeredQuestions,
    answeredQuestions,
  });

  return NextResponse.json({ ticker, ...signals, caption, engine, mix7d, composite });
}

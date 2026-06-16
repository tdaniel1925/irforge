import { runTickerAudit } from "@/lib/audit";
import { getMarketTrending } from "@/lib/trending";
import { getBigMovers } from "@/lib/boards";
import { getWatchedTickers } from "@/lib/publicStats";
import { auditToStatRow, upsertStatRow } from "@/lib/companyStats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — sequential audits across the universe

// Nightly snapshot of the "breakout universe" into company_stats. The universe is
// self-curating: tickers trending across the market + today's big movers + the
// ones our own visitors are watching. Each is audited once and its screenable
// facts are written to the table the AI screener queries. NO recommendations —
// just facts. Capped so the run stays within cron time + data-API budget.
const MAX_TICKERS = 120;

function authorized(req: Request): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

const SYM_RE = /^[A-Z]{1,6}$/;

// Assemble candidate tickers with a reason + a blended score for ranking which
// ones make the cap. Trending score dominates; movers/traffic add a flat boost.
async function buildUniverse(): Promise<{ ticker: string; reason: string; score: number }[]> {
  const map = new Map<string, { reason: string; score: number }>();
  const add = (raw: string, reason: string, score: number) => {
    const t = String(raw || "").toUpperCase();
    if (!SYM_RE.test(t)) return;
    const cur = map.get(t);
    if (!cur) map.set(t, { reason, score });
    else map.set(t, { reason: cur.reason, score: Math.max(cur.score, score) + 1 });
  };

  const [trending, movers, watched] = await Promise.allSettled([
    getMarketTrending(40),
    getBigMovers(),
    getWatchedTickers(),
  ]);

  if (trending.status === "fulfilled") {
    for (const t of trending.value.tickers) add(t.ticker, `trending (${t.sources.join(", ")})`, 50 + (t.score || 0));
  }
  if (movers.status === "fulfilled") {
    for (const m of movers.value.gainers) add(m.ticker, "top gainer today", 40);
    for (const m of movers.value.actives) add(m.ticker, "most active today", 35);
    for (const m of movers.value.losers) add(m.ticker, "top decliner today", 25);
  }
  if (watched.status === "fulfilled") {
    for (const t of watched.value) add(t, "watched by our users", 30);
  }

  return Array.from(map.entries())
    .map(([ticker, v]) => ({ ticker, reason: v.reason, score: v.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_TICKERS);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  const universe = await buildUniverse();
  let ok = 0;
  let failed = 0;

  // Sequential — many external API calls per audit; parallel would trip rate limits.
  for (const { ticker, reason, score } of universe) {
    try {
      const audit = await runTickerAudit(ticker, []);
      if (audit && audit.ticker) {
        const wrote = await upsertStatRow(auditToStatRow(audit, reason, score));
        wrote ? ok++ : failed++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
      console.error(`[snapshot-stats] ${ticker} failed:`, e instanceof Error ? e.message : e);
    }
    // Soft time budget: stop before the platform kills us mid-write.
    if (Date.now() - started > 280_000) {
      console.warn(`[snapshot-stats] time budget hit after ${ok + failed} tickers`);
      break;
    }
  }

  return Response.json({
    ok: true,
    universeSize: universe.length,
    snapshotted: ok,
    failed,
    elapsedMs: Date.now() - started,
  });
}

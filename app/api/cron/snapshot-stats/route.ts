import { runTickerAudit } from "@/lib/audit";
import { getMarketTrending } from "@/lib/trending";
import { getBigMovers } from "@/lib/boards";
import { getWatchedTickers } from "@/lib/publicStats";
import { auditToStatRow, upsertStatRow, getExistingSnapshotTimes } from "@/lib/companyStats";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — sequential audits per chunk

// Chunked snapshot of the "breakout universe" into company_stats. The universe is
// self-curating: tickers trending across the market + today's big movers + the
// ones our own visitors are watching, MERGED with everything already in the table.
//
// Each run can only audit a slice before the serverless time limit, so instead of
// trying (and failing) to do the whole universe at once, we refresh the STALEST
// rows first: never-snapshotted tickers, then oldest snapshot_at. Run this cron
// frequently (e.g. every 30 min) and the full universe stays continuously fresh
// with no cursor to manage. NO recommendations — just facts.
const UNIVERSE_CAP = 250;  // total tickers we'll track
const CHUNK = 25;          // tickers refreshed per run (fits the time budget)


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

  return Array.from(map.entries()).map(([ticker, v]) => ({ ticker, reason: v.reason, score: v.score }));
}

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();

  // 1) Build today's candidate universe (trending/movers/watched) and merge with
  //    everything already tracked, so existing tickers keep getting refreshed.
  const candidates = await buildUniverse();
  const existingTimes = await getExistingSnapshotTimes();
  const merged = new Map<string, { reason: string; score: number }>();
  for (const c of candidates) merged.set(c.ticker, { reason: c.reason, score: c.score });
  for (const ticker of Object.keys(existingTimes)) {
    if (!merged.has(ticker)) merged.set(ticker, { reason: "already tracked", score: 0 });
  }

  // 2) Cap the universe by score (fresh hot names win the cap over stale cold ones).
  const universe = Array.from(merged.entries())
    .map(([ticker, v]) => ({ ticker, ...v }))
    .sort((a, b) => b.score - a.score)
    .slice(0, UNIVERSE_CAP);

  // 3) Refresh the STALEST first: never-snapshotted (no time) before oldest time.
  //    This advances coverage every run with no cursor to track.
  const byStaleness = [...universe].sort((a, b) => {
    const ta = existingTimes[a.ticker] ?? ""; // "" sorts first = never snapshotted
    const tb = existingTimes[b.ticker] ?? "";
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  const batch = byStaleness.slice(0, CHUNK);

  let ok = 0;
  let failed = 0;
  // Sequential — many external API calls per audit; parallel would trip rate limits.
  for (const { ticker, reason, score } of batch) {
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
    if (Date.now() - started > 280_000) {
      console.warn(`[snapshot-stats] time budget hit after ${ok + failed} tickers`);
      break;
    }
  }

  return Response.json({
    ok: true,
    universeSize: universe.length,
    chunkSize: batch.length,
    snapshotted: ok,
    failed,
    elapsedMs: Date.now() - started,
  });
}

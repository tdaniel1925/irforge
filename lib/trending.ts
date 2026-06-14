import { getIhubBreakouts } from "./ihub";

// Cross-market "what's trending" — blended from independent sources so no single
// one (or its outage/ToS block) controls the list. Each source is isolated: a
// failure contributes nothing instead of breaking the feature.
//
// Sources:
//  - StockTwits official trending API (sanctioned)
//  - Reddit r/pennystocks + r/wallstreetbets mention velocity (public API)
//  - SEC EDGAR recent 8-K bursts (real catalysts)
//  - Yahoo most-actives (volume) (public)
//  - InvestorsHub breakout boards (best-effort scrape; degrades to nothing)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type TrendSource = "StockTwits" | "Reddit" | "EDGAR" | "Volume" | "iHub";

export interface TrendingTicker {
  ticker: string;
  score: number; // blended rank score (higher = hotter)
  sources: TrendSource[];
  mentions?: number;
}

async function getJson(url: string, headers: Record<string, string> = {}, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const SYM_RE = /^[A-Z]{1,6}$/;

// ---- individual sources (each returns ranked tickers, never throws) ----

async function stocktwitsTrending(): Promise<string[]> {
  try {
    const data = await getJson("https://api.stocktwits.com/api/2/trending/symbols.json");
    const syms: string[] = (data?.symbols ?? []).map((s: any) => String(s.symbol).toUpperCase()).filter((s: string) => SYM_RE.test(s));
    return syms.slice(0, 30);
  } catch {
    return [];
  }
}

async function redditVelocity(): Promise<{ ticker: string; mentions: number }[]> {
  const subs = ["pennystocks", "wallstreetbets"];
  const counts = new Map<string, number>();
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        const data = await getJson(
          `https://www.reddit.com/r/${sub}/hot.json?limit=75&raw_json=1`,
          { "User-Agent": "Mozilla/5.0 (compatible; PubcoZoneBot/1.0; +https://pubcozone.com)" }
        );
        const posts: any[] = data?.data?.children ?? [];
        for (const p of posts) {
          const text = `${p.data?.title ?? ""} ${p.data?.selftext ?? ""}`;
          // $TICKER cashtags are the reliable signal.
          const cashtags = Array.from(text.matchAll(/\$([A-Za-z]{1,6})\b/g));
          for (const m of cashtags) {
            const sym = m[1].toUpperCase();
            if (SYM_RE.test(sym)) counts.set(sym, (counts.get(sym) ?? 0) + 1);
          }
        }
      } catch {
        /* skip this sub */
      }
    })
  );
  return Array.from(counts.entries())
    .map(([ticker, mentions]) => ({ ticker, mentions }))
    .filter((r) => r.mentions >= 2)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 30);
}

async function edgarBursts(): Promise<string[]> {
  // Companies with very recent 8-Ks = fresh material events. The SEC full-text
  // search returns recent filings; we rank tickers by 8-K count in the window.
  try {
    const data = await getJson(
      "https://efts.sec.gov/LATEST/search-index?q=&forms=8-K&dateRange=custom",
      { Accept: "application/json" }
    );
    const hits: any[] = data?.hits?.hits ?? [];
    const counts = new Map<string, number>();
    for (const h of hits) {
      const tks: string[] = h?._source?.tickers ?? [];
      for (const t of tks) {
        const sym = String(t).toUpperCase();
        if (SYM_RE.test(sym)) counts.set(sym, (counts.get(sym) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 30);
  } catch {
    return [];
  }
}

async function yahooMostActive(): Promise<string[]> {
  try {
    const data = await getJson(
      "https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=30&scrIds=most_actives"
    );
    const quotes: any[] = data?.finance?.result?.[0]?.quotes ?? [];
    return quotes.map((q) => String(q.symbol).toUpperCase()).filter((s) => SYM_RE.test(s)).slice(0, 30);
  } catch {
    return [];
  }
}

// ---- blend ----

export async function getMarketTrending(limit = 20): Promise<{ tickers: TrendingTicker[]; activeSources: TrendSource[] }> {
  const [stwits, reddit, edgar, volume, ihub] = await Promise.all([
    stocktwitsTrending(),
    redditVelocity(),
    edgarBursts(),
    yahooMostActive(),
    getIhubBreakouts(20),
  ]);

  const merged = new Map<string, TrendingTicker>();
  const bump = (ticker: string, src: TrendSource, points: number, mentions?: number) => {
    const T = ticker.toUpperCase();
    if (!SYM_RE.test(T)) return;
    let row = merged.get(T);
    if (!row) {
      row = { ticker: T, score: 0, sources: [] };
      merged.set(T, row);
    }
    row.score += points;
    if (!row.sources.includes(src)) row.sources.push(src);
    if (mentions) row.mentions = (row.mentions ?? 0) + mentions;
  };

  // Rank position → points (top of each list is worth more).
  stwits.forEach((t, i) => bump(t, "StockTwits", 30 - i));
  reddit.forEach((r, i) => bump(r.ticker, "Reddit", 28 - i, r.mentions));
  edgar.forEach((t, i) => bump(t, "EDGAR", 22 - i));
  volume.forEach((t, i) => bump(t, "Volume", 20 - i));
  ihub.forEach((r) => bump(r.ticker, "iHub", 24 - r.rank));

  // A ticker confirmed by multiple independent sources is more trustworthy than
  // one loud source — reward cross-source agreement.
  const tickers = Array.from(merged.values())
    .map((r) => ({ ...r, score: r.score * (1 + (r.sources.length - 1) * 0.25) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const activeSources: TrendSource[] = [];
  if (stwits.length) activeSources.push("StockTwits");
  if (reddit.length) activeSources.push("Reddit");
  if (edgar.length) activeSources.push("EDGAR");
  if (volume.length) activeSources.push("Volume");
  if (ihub.length) activeSources.push("iHub");

  return { tickers, activeSources };
}

// Lightweight batch quote fetch for the Discover hub — one call for many tickers.
// Separate from the heavy per-ticker audit so leaderboards render fast.

export interface Quote {
  ticker: string;
  price?: number;
  changePct?: number; // regular-session % change
  volume?: number;
  currency?: string;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Yahoo's v7 batch /quote endpoint now returns 401 (crumb-gated). The v8 /chart
// endpoint still works unauthenticated, so we fetch each symbol's mini-chart in
// parallel (capped) and derive price / day-change / volume from its meta.
async function fetchOne(sym: string): Promise<Quote | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1d`,
      { headers: { "User-Agent": UA }, signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : undefined;
    const prevClose = typeof meta.chartPreviousClose === "number" ? meta.chartPreviousClose
      : typeof meta.previousClose === "number" ? meta.previousClose : undefined;
    const changePct = price != null && prevClose ? ((price - prevClose) / prevClose) * 100 : undefined;
    return {
      ticker: sym,
      price,
      changePct,
      volume: typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : undefined,
      currency: meta.currency,
    };
  } catch {
    return null;
  }
}

export async function getQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const syms = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).slice(0, 40);
  if (syms.length === 0) return out;

  // Cap concurrency so we don't hammer Yahoo or blow the request budget.
  const CONCURRENCY = 8;
  for (let i = 0; i < syms.length; i += CONCURRENCY) {
    const batch = syms.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(fetchOne));
    for (const q of results) if (q) out[q.ticker] = q;
  }
  return out;
}

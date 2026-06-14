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

export async function getQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const syms = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).slice(0, 60);
  if (syms.length === 0) return out;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(syms.join(","))}`,
      { headers: { "User-Agent": UA }, signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list: any[] = data?.quoteResponse?.result ?? [];
    for (const q of list) {
      const sym = String(q.symbol ?? "").toUpperCase();
      if (!sym) continue;
      out[sym] = {
        ticker: sym,
        price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : undefined,
        changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : undefined,
        volume: typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : undefined,
        currency: q.currency,
      };
    }
  } catch {
    // Leaderboards still render with engagement columns even if quotes fail.
  }
  return out;
}

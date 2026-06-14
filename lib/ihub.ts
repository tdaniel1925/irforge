// Best-effort InvestorsHub "Breakout Boards" reader.
//
// NOTE: iHub sits behind Cloudflare and forbids scraping in its ToS. We treat it
// as a *fragile, optional* signal: this function NEVER throws — on a block, a
// markup change, or a timeout it returns []. The Market Trending feature is
// carried by legal sources (StockTwits/Reddit/EDGAR/volume); iHub is additive
// only, and clearly attributed when present.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Symbols that are really English words / prose initials, not tickers.
const STOPWORDS = new Set(["A", "I", "T", "M", "U", "S", "PM", "ET", "CEO", "CFO", "IR", "USA", "SEC", "NEW", "ALL", "BIG"]);

export interface IhubRow {
  ticker: string;
  rank: number;
}

export async function getIhubBreakouts(limit = 15): Promise<IhubRow[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch("https://investorshub.advfn.com/boards/breakoutboards.aspx", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return []; // Cloudflare 403 etc. → silently degrade
    const html = await res.text();
    if (html.length < 5000) return []; // challenge page / empty

    // Breakout rows render the ticker as "(SYM)". Take them in document order
    // (that order matches the ranked table) and de-dupe, dropping prose initials.
    const seen = new Set<string>();
    const rows: IhubRow[] = [];
    const matches = Array.from(html.matchAll(/\(([A-Z]{2,6})\)/g));
    for (const m of matches) {
      const sym = m[1];
      if (STOPWORDS.has(sym) || seen.has(sym)) continue;
      seen.add(sym);
      rows.push({ ticker: sym, rank: rows.length + 1 });
      if (rows.length >= limit) break;
    }
    return rows;
  } catch {
    return [];
  }
}

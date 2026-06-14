// Market-wide discovery board data (our versions of iHub's Movers / Buzz Cloud /
// Halts). All sources are public + legal; each is isolated and degrades to empty
// instead of throwing. Sources are always shown to the user (no passing off).

import { finraShortFile } from "./audit";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const SYM_RE = /^[A-Z]{1,6}$/;

async function getJson(url: string, headers: Record<string, string> = {}, ms = 9000): Promise<any> {
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

// ─────────────────────────── Big Movers ───────────────────────────
export interface Mover {
  ticker: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string;
  kind: "gainer" | "loser" | "active";
}

async function yahooScreener(scrId: string): Promise<any[]> {
  try {
    const data = await getJson(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=25&scrIds=${scrId}`
    );
    return data?.finance?.result?.[0]?.quotes ?? [];
  } catch {
    return [];
  }
}

function mapMover(q: any, kind: Mover["kind"]): Mover | null {
  const ticker = String(q?.symbol ?? "").toUpperCase();
  if (!SYM_RE.test(ticker)) return null;
  return {
    ticker,
    price: typeof q.regularMarketPrice === "number" ? q.regularMarketPrice : null,
    changePct: typeof q.regularMarketChangePercent === "number" ? q.regularMarketChangePercent : null,
    volume: typeof q.regularMarketVolume === "number" ? q.regularMarketVolume : null,
    currency: q.currency ?? "USD",
    kind,
  };
}

export async function getBigMovers(): Promise<{ gainers: Mover[]; losers: Mover[]; actives: Mover[] }> {
  const [g, l, a] = await Promise.all([
    yahooScreener("day_gainers"),
    yahooScreener("day_losers"),
    yahooScreener("most_actives"),
  ]);
  return {
    gainers: g.map((q) => mapMover(q, "gainer")).filter((x): x is Mover => x !== null).slice(0, 15),
    losers: l.map((q) => mapMover(q, "loser")).filter((x): x is Mover => x !== null).slice(0, 15),
    actives: a.map((q) => mapMover(q, "active")).filter((x): x is Mover => x !== null).slice(0, 15),
  };
}

// ─────────────────────────── Buzz Cloud ───────────────────────────
export interface BuzzWord {
  ticker: string;
  weight: number; // mention count across social
}

export async function getBuzzCloud(): Promise<BuzzWord[]> {
  const counts = new Map<string, number>();
  const add = (t: string, n: number) => {
    const T = t.toUpperCase();
    if (SYM_RE.test(T)) counts.set(T, (counts.get(T) ?? 0) + n);
  };

  await Promise.allSettled([
    // StockTwits trending — give each a base weight by rank position.
    (async () => {
      try {
        const data = await getJson("https://api.stocktwits.com/api/2/trending/symbols.json");
        const syms: any[] = data?.symbols ?? [];
        syms.forEach((s, i) => add(String(s.symbol), Math.max(1, 30 - i)));
      } catch {
        /* skip */
      }
    })(),
    // Reddit cashtag frequency.
    ...["pennystocks", "wallstreetbets", "stocks"].map((sub) => async () => {
      try {
        const data = await getJson(`https://www.reddit.com/r/${sub}/hot.json?limit=75&raw_json=1`, {
          "User-Agent": "Mozilla/5.0 (compatible; PubcoZoneBot/1.0; +https://pubcozone.com)",
        });
        const posts: any[] = data?.data?.children ?? [];
        for (const p of posts) {
          const text = `${p.data?.title ?? ""} ${p.data?.selftext ?? ""}`;
          for (const m of Array.from(text.matchAll(/\$([A-Za-z]{1,6})\b/g))) add(m[1], 1);
        }
      } catch {
        /* skip */
      }
    }).map((f) => f()),
  ]);

  return Array.from(counts.entries())
    .map(([ticker, weight]) => ({ ticker, weight }))
    .filter((w) => w.weight >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 40);
}

// ──────────────────────── Halt & Risk Watch ────────────────────────
export interface RiskRow {
  ticker: string;
  kind: "halt" | "short";
  detail: string;
  value?: number; // e.g. short %
}

async function recentHalts(): Promise<RiskRow[]> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", {
      headers: { "User-Agent": UA, Accept: "application/xml" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const out: RiskRow[] = [];
    const seen = new Set<string>();
    for (const m of Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))) {
      const item = m[1];
      const sym = item.match(/IssueSymbol>\s*([A-Z.\-]+)\s*</)?.[1]?.toUpperCase();
      if (!sym || !SYM_RE.test(sym) || seen.has(sym)) continue;
      seen.add(sym);
      const reason = item.match(/ReasonCode>\s*([^<]+?)\s*</)?.[1] ?? "halt";
      const date = item.match(/HaltDate>\s*([^<]+?)\s*</)?.[1] ?? "";
      out.push({ ticker: sym, kind: "halt", detail: `Halted ${date} · code ${reason}` });
      if (out.length >= 20) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function highShortVolume(): Promise<RiskRow[]> {
  // Reuse the FINRA RegSHO daily file the audit already knows how to fetch.
  try {
    const file = await finraShortFile();
    const out: RiskRow[] = [];
    for (const [ticker, { short, total }] of Array.from(file.rows.entries())) {
      if (total < 50000) continue; // ignore thin names — noise
      const pct = (short / total) * 100;
      if (pct >= 65 && SYM_RE.test(ticker)) out.push({ ticker, kind: "short", detail: `${pct.toFixed(0)}% of daily volume short`, value: pct });
    }
    return out.sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 20);
  } catch {
    return [];
  }
}

export async function getRiskWatch(): Promise<{ halts: RiskRow[]; shorts: RiskRow[] }> {
  const [halts, shorts] = await Promise.all([recentHalts(), highShortVolume()]);
  return { halts, shorts };
}

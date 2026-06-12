// Ticker Audit — live public-data intelligence on any ticker.
// Sources (all keyless): SEC EDGAR, StockTwits public API, Reddit public JSON.
// Every source fails independently; the report renders with whatever succeeded.

export interface AuditSource {
  name: string;
  ok: boolean;
  note?: string;
}

export interface TopAccount {
  username: string;
  followers: number;
  lastMessage: string;
  ideas: number;
}

export interface PeerStat {
  ticker: string;
  watchers?: number;
  msgsPerDay?: number;
  error?: string;
}

export interface MarketStat {
  price?: number;
  changePct3mo?: number;
  lastVolume?: number;
  avgVolume3mo?: number;
  priceSeries?: number[]; // ~3mo daily closes for charting
  high52?: number;
  low52?: number;
  marketCap?: number;
  currency?: string;
}

export interface NewsStat {
  articles30d: number;
  topOutlets: string[];
  samples: { title: string; outlet: string; date: string }[];
}

export interface ShortStat {
  date: string; // YYYYMMDD of the FINRA file
  shortVolume: number;
  totalVolume: number;
  shortPct: number; // 0-100
  venue: "NMS" | "OTC";
}

export interface Fundamentals {
  cash?: number;
  cashAsOf?: string;
  revenueAnnual?: number;
  netIncomeAnnual?: number;
  sharesOutstanding?: number;
  sharesChangePct1y?: number;
  runwayQuarters?: number; // cash / avg quarterly loss, only when losing money
}

export interface InsiderStat {
  form4Count180d: number;
  buys: number; // open-market purchases (code P) across recent Form 4s
  sells: number; // sales (code S)
  lastFilingDate?: string;
}

export interface WikiStat {
  title: string;
  views30d: number;
  viewsPrev30d: number;
}

export interface HaltStat {
  count: number;
  recent: { date: string; reason: string }[];
}

export interface CatalystStat {
  trials?: { total: number; samples: { title: string; phase: string; status: string }[] };
  contracts?: { count: number; totalAmount: number; samples: { description: string; amount: number }[] };
}

export interface CompanyProfile {
  industry?: string; // SIC description
  hq?: string; // "City, ST"
  incorporated?: string; // state/country of incorporation
  exchange?: string;
  phone?: string;
  fiscalYearEnd?: string; // "1231" → rendered as Dec 31
  // Enriched from Wikidata:
  founded?: string;
  ceo?: string;
  employees?: string;
  website?: string;
}

export interface FilingMention {
  // This company referenced in SOMEONE ELSE'S filing — a Defense/intel signal.
  byCompany: string;
  form: string;
  date: string;
  url: string;
}

export interface RegulatoryEvent {
  source: string; // "FDA"
  type: string; // "Drug approval" | "Recall" | ...
  title: string;
  date: string;
}

export interface FilingRef {
  form: string;
  title: string;
  date: string;
  url: string;
}

export interface ChatterMessage {
  author: string;
  followers: number;
  body: string;
  sentiment: "Bullish" | "Bearish" | null;
  ts: string;
}

export interface OtcStat {
  tier?: string; // e.g. "Pink Current Information", "OTCQB"
  caveatEmptor?: boolean; // the skull flag — serious red flag
  website?: string;
  isAlternativeReporting?: boolean; // files via OTC Disclosure service, not EDGAR
  recentReports: { title: string; date: string }[];
}

export interface TickerAudit {
  ticker: string;
  companyName?: string;
  cik?: string;
  generatedAt: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  sources: AuditSource[];
  filings: { last12mo: number; lastFilingDate?: string; lastForm?: string };
  profile?: CompanyProfile;
  recentFilings: FilingRef[];
  filingMentions: FilingMention[]; // mentioned in others' EDGAR filings
  regulatory: RegulatoryEvent[]; // FDA etc.
  social: {
    watchers?: number;
    msgsPerDay?: number;
    lastMessageAgeDays?: number;
    bullish: number;
    bearish: number;
    unrated: number;
    topAccounts: TopAccount[];
    recentMessages: ChatterMessage[];
  };
  reddit: { postsFound: number; topSubreddits: string[]; samples: { title: string; subreddit: string; ups: number }[] };
  market: MarketStat;
  news: NewsStat;
  shortData?: ShortStat;
  fundamentals?: Fundamentals;
  insiders?: InsiderStat;
  wiki?: WikiStat;
  halts?: HaltStat;
  catalysts?: CatalystStat;
  otc?: OtcStat;
  peers: PeerStat[];
  findings: string[];
}

const UA = { "User-Agent": "PubcoZone TickerAudit research tool contact@irforge.app" };
const timeout = (ms: number) => AbortSignal.timeout(ms);

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers: { ...UA, ...headers }, signal: timeout(9000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- EDGAR ----------

let tickerMapCache: Record<string, { cik_str: number; title: string }> | null = null;

async function lookupCompany(ticker: string): Promise<{ cik: string; name: string } | null> {
  if (!tickerMapCache) {
    const raw = await getJson("https://www.sec.gov/files/company_tickers.json");
    tickerMapCache = {};
    for (const k of Object.keys(raw)) tickerMapCache[String(raw[k].ticker).toUpperCase()] = raw[k];
  }
  const hit = tickerMapCache[ticker.toUpperCase()];
  return hit ? { cik: String(hit.cik_str).padStart(10, "0"), name: hit.title } : null;
}

const MAJOR_FORMS = new Set(["8-K", "10-Q", "10-K", "6-K", "20-F", "S-1", "424B4", "DEF 14A", "S-3"]);

async function filingStats(cik: string): Promise<{
  stats: { last12mo: number; lastFilingDate?: string; lastForm?: string };
  profile: CompanyProfile;
  recentFilings: FilingRef[];
}> {
  const data = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const recent = data?.filings?.recent;

  const biz = data?.addresses?.business;
  const profile: CompanyProfile = {
    industry: data?.sicDescription || undefined,
    hq: biz?.city ? `${biz.city}${biz.stateOrCountry ? `, ${biz.stateOrCountry}` : ""}` : undefined,
    incorporated: data?.stateOfIncorporationDescription || data?.stateOfIncorporation || undefined,
    exchange: Array.isArray(data?.exchanges) && data.exchanges.length > 0 ? data.exchanges[0] : undefined,
    phone: data?.phone || undefined,
    fiscalYearEnd: data?.fiscalYearEnd || undefined,
  };

  if (!recent?.filingDate) return { stats: { last12mo: 0 }, profile, recentFilings: [] };

  const yearAgo = Date.now() - 365 * 86400000;
  let count = 0;
  const recentFilings: FilingRef[] = [];
  const cikNum = Number(cik);
  for (let i = 0; i < recent.filingDate.length; i++) {
    if (new Date(recent.filingDate[i]).getTime() >= yearAgo) count++;
    if (recentFilings.length < 6 && MAJOR_FORMS.has(recent.form[i])) {
      const accession = String(recent.accessionNumber[i]).replace(/-/g, "");
      recentFilings.push({
        form: recent.form[i],
        title: recent.primaryDocDescription?.[i] || recent.form[i],
        date: recent.filingDate[i],
        url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession}/${recent.primaryDocument[i]}`,
      });
    }
  }
  return { stats: { last12mo: count, lastFilingDate: recent.filingDate[0], lastForm: recent.form[0] }, profile, recentFilings };
}

// ---------- StockTwits ----------

interface StSnapshot {
  watchers?: number;
  msgsPerDay?: number;
  lastMessageAgeDays?: number;
  bullish: number;
  bearish: number;
  unrated: number;
  topAccounts: TopAccount[];
  recentMessages: ChatterMessage[];
}

async function stocktwits(ticker: string): Promise<StSnapshot> {
  const data = await getJson(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(ticker)}.json`);
  const messages: any[] = data?.messages ?? [];
  let bullish = 0,
    bearish = 0,
    unrated = 0;
  const byUser = new Map<string, TopAccount>();
  const recentMessages: ChatterMessage[] = [];

  for (const m of messages) {
    const s = m?.entities?.sentiment?.basic;
    if (s === "Bullish") bullish++;
    else if (s === "Bearish") bearish++;
    else unrated++;
    if (recentMessages.length < 6 && m?.user?.username && m?.body) {
      recentMessages.push({
        author: m.user.username,
        followers: m.user.followers ?? 0,
        body: String(m.body).slice(0, 220),
        sentiment: s === "Bullish" || s === "Bearish" ? s : null,
        ts: m.created_at,
      });
    }
    const u = m?.user;
    if (u?.username) {
      const existing = byUser.get(u.username);
      if (existing) existing.ideas++;
      else
        byUser.set(u.username, {
          username: u.username,
          followers: u.followers ?? 0,
          lastMessage: String(m.body ?? "").slice(0, 140),
          ideas: 1,
        });
    }
  }

  let msgsPerDay: number | undefined;
  let lastMessageAgeDays: number | undefined;
  if (messages.length > 0) {
    const newest = new Date(messages[0].created_at).getTime();
    const oldest = new Date(messages[messages.length - 1].created_at).getTime();
    lastMessageAgeDays = Math.max(0, (Date.now() - newest) / 86400000);
    const spanDays = Math.max(0.25, (newest - oldest) / 86400000);
    msgsPerDay = messages.length / spanDays;
  }

  return {
    watchers: data?.symbol?.watchlist_count,
    msgsPerDay,
    lastMessageAgeDays,
    bullish,
    bearish,
    unrated,
    topAccounts: Array.from(byUser.values()).sort((a, b) => b.followers - a.followers).slice(0, 8),
    recentMessages,
  };
}

// ---------- Reddit ----------

async function redditScan(ticker: string): Promise<TickerAudit["reddit"]> {
  // Reddit's public JSON rejects non-browser user agents from many networks.
  const data = await getJson(
    `https://www.reddit.com/search.json?q=%24${encodeURIComponent(ticker)}&sort=new&limit=50&t=year&raw_json=1`,
    { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }
  );
  const posts: any[] = (data?.data?.children ?? []).map((c: any) => c.data);
  const subCount = new Map<string, number>();
  for (const p of posts) subCount.set(p.subreddit, (subCount.get(p.subreddit) ?? 0) + 1);
  return {
    postsFound: posts.length,
    topSubreddits: Array.from(subCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => `r/${s}`),
    samples: posts
      .sort((a, b) => (b.ups ?? 0) - (a.ups ?? 0))
      .slice(0, 5)
      .map((p) => ({ title: String(p.title).slice(0, 120), subreddit: `r/${p.subreddit}`, ups: p.ups ?? 0 })),
  };
}

// ---------- Yahoo Finance (market pulse) ----------

async function yahooMarket(ticker: string): Promise<MarketStat> {
  const data = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=3mo&interval=1d`,
    { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36" }
  );
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error("no chart data");
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const volumes: (number | null)[] = result.indicators?.quote?.[0]?.volume ?? [];
  const validCloses = closes.filter((c): c is number => typeof c === "number");
  const validVols = volumes.filter((v): v is number => typeof v === "number" && v > 0);
  const price = result.meta?.regularMarketPrice ?? validCloses[validCloses.length - 1];
  const first = validCloses[0];
  const meta = result.meta ?? {};
  return {
    price,
    changePct3mo: first && price ? ((price - first) / first) * 100 : undefined,
    lastVolume: validVols[validVols.length - 1],
    avgVolume3mo: validVols.length ? Math.round(validVols.reduce((a, b) => a + b, 0) / validVols.length) : undefined,
    // Downsample to ~60 points so the payload stays small.
    priceSeries: validCloses.length > 60 ? validCloses.filter((_, i) => i % Math.ceil(validCloses.length / 60) === 0) : validCloses,
    high52: meta.fiftyTwoWeekHigh ?? (validCloses.length ? Math.max(...validCloses) : undefined),
    low52: meta.fiftyTwoWeekLow ?? (validCloses.length ? Math.min(...validCloses) : undefined),
    currency: meta.currency,
  };
}

// ---------- GDELT (global news coverage) ----------

async function gdeltNews(ticker: string, companyName?: string): Promise<NewsStat> {
  // Drop corporate suffixes/punctuation — GDELT phrase search chokes on "CORP."
  const cleaned = companyName
    ?.replace(/[.,]/g, "")
    .replace(/\b(CORP|INC|LTD|PLC|CO|HOLDINGS|GROUP)\b\s*$/i, "")
    .trim();
  const q = `${cleaned ? `"${cleaned}"` : `"${ticker} stock"`} sourcelang:eng`;
  const data = await getJson(
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=40&timespan=30d&format=json`
  );
  const articles: any[] = data?.articles ?? [];
  const byOutlet = new Map<string, number>();
  for (const a of articles) byOutlet.set(a.domain, (byOutlet.get(a.domain) ?? 0) + 1);
  return {
    articles30d: articles.length,
    topOutlets: Array.from(byOutlet.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d),
    samples: articles.slice(0, 5).map((a) => ({
      title: String(a.title ?? "").slice(0, 120),
      outlet: a.domain ?? "",
      date: String(a.seendate ?? "").slice(0, 8),
    })),
  };
}

// ---------- FINRA Reg SHO daily short volume ----------
// Free, keyless daily files: one row per symbol, pipe-delimited.
// Note: daily short VOLUME (includes market-maker activity) — not the same
// thing as bi-monthly short INTEREST, which requires a FINRA API account.

let finraCache: { fileDate: string; rows: Map<string, { short: number; total: number }> } | null = null;

async function finraShortFile(): Promise<{ fileDate: string; rows: Map<string, { short: number; total: number }> }> {
  // Walk back from today to the most recent trading day with a published file.
  for (let back = 0; back <= 7; back++) {
    const d = new Date(Date.now() - back * 86400000);
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    if (finraCache && finraCache.fileDate === ymd) return finraCache;
    try {
      const res = await fetch(`https://cdn.finra.org/equity/regsho/daily/CNMSshvol${ymd}.txt`, {
        headers: UA,
        signal: timeout(9000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const text = await res.text();
      const rows = new Map<string, { short: number; total: number }>();
      const lines = text.split("\n");
      for (let i = 1; i < lines.length; i++) {
        const f = lines[i].split("|");
        if (f.length < 5) continue;
        rows.set(f[1], { short: Number(f[2]) || 0, total: Number(f[4]) || 0 });
      }
      if (rows.size === 0) continue;
      finraCache = { fileDate: ymd, rows };
      return finraCache;
    } catch {
      continue;
    }
  }
  throw new Error("no FINRA file found in the last 7 days");
}

async function finraShort(ticker: string): Promise<ShortStat> {
  const { fileDate, rows } = await finraShortFile();
  const row = rows.get(ticker.toUpperCase());
  if (row && row.total > 0) {
    return { date: fileDate, shortVolume: row.short, totalVolume: row.total, shortPct: (row.short / row.total) * 100, venue: "NMS" };
  }
  // OTC fallback — same format, FINRA ORF file.
  const res = await fetch(`https://cdn.finra.org/equity/regsho/daily/FORFshvol${fileDate}.txt`, {
    headers: UA,
    signal: timeout(9000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("symbol not in FINRA NMS or OTC files");
  const lines = (await res.text()).split("\n");
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split("|");
    if (f.length >= 5 && f[1] === ticker.toUpperCase()) {
      const short = Number(f[2]) || 0;
      const total = Number(f[4]) || 0;
      if (total > 0) return { date: fileDate, shortVolume: short, totalVolume: total, shortPct: (short / total) * 100, venue: "OTC" };
    }
  }
  throw new Error("symbol not in FINRA NMS or OTC files");
}

// ---------- XBRL fundamentals (SEC company facts) ----------

function latestFact(units: any[] | undefined, opts?: { annual?: boolean }): { val: number; end: string } | undefined {
  if (!units) return undefined;
  let best: { val: number; end: string } | undefined;
  for (const u of units) {
    if (typeof u?.val !== "number" || !u?.end) continue;
    if (opts?.annual) {
      if (!u.start) continue;
      const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
      if (days < 330 || days > 400) continue;
    }
    if (!best || u.end > best.end) best = { val: u.val, end: u.end };
  }
  return best;
}

function anyUnit(concept: any): any[] | undefined {
  // Prefer USD, otherwise take whatever currency the issuer reports in (IFRS filers).
  const units = concept?.units;
  if (!units) return undefined;
  if (units.USD) return units.USD;
  const keys = Object.keys(units);
  return keys.length > 0 ? units[keys[0]] : undefined;
}

async function xbrlFundamentals(cik: string): Promise<Fundamentals> {
  const data = await getJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  const gaap = data?.facts?.["us-gaap"] ?? {};
  const ifrs = data?.facts?.["ifrs-full"] ?? {};
  const dei = data?.facts?.dei ?? {};

  const cash =
    latestFact(anyUnit(gaap.CashAndCashEquivalentsAtCarryingValue)) ??
    latestFact(anyUnit(gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents)) ??
    latestFact(anyUnit(gaap.Cash)) ??
    latestFact(anyUnit(ifrs.CashAndCashEquivalents)) ??
    latestFact(anyUnit(ifrs.Cash));
  const revenue =
    latestFact(anyUnit(gaap.Revenues), { annual: true }) ??
    latestFact(anyUnit(gaap.RevenueFromContractWithCustomerExcludingAssessedTax), { annual: true }) ??
    latestFact(anyUnit(ifrs.Revenue), { annual: true });
  const netIncome =
    latestFact(anyUnit(gaap.NetIncomeLoss), { annual: true }) ??
    latestFact(anyUnit(ifrs.ProfitLoss), { annual: true });

  const sharesSeries: any[] = dei.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  const sharesNow = latestFact(sharesSeries);
  let sharesChangePct1y: number | undefined;
  if (sharesNow) {
    const targetTime = new Date(sharesNow.end).getTime() - 365 * 86400000;
    let yearAgo: { val: number; end: string } | undefined;
    let bestDist = Infinity;
    for (const u of sharesSeries) {
      if (typeof u?.val !== "number" || !u?.end) continue;
      const dist = Math.abs(new Date(u.end).getTime() - targetTime);
      if (dist < bestDist && dist < 120 * 86400000) {
        bestDist = dist;
        yearAgo = { val: u.val, end: u.end };
      }
    }
    if (yearAgo && yearAgo.val > 0) sharesChangePct1y = ((sharesNow.val - yearAgo.val) / yearAgo.val) * 100;
  }

  let runwayQuarters: number | undefined;
  if (cash && netIncome && netIncome.val < 0) {
    runwayQuarters = cash.val / (Math.abs(netIncome.val) / 4);
  }

  return {
    cash: cash?.val,
    cashAsOf: cash?.end,
    revenueAnnual: revenue?.val,
    netIncomeAnnual: netIncome?.val,
    sharesOutstanding: sharesNow?.val,
    sharesChangePct1y,
    runwayQuarters,
  };
}

// ---------- Form 4 insider transactions ----------

async function insiderActivity(cik: string): Promise<InsiderStat> {
  const data = await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`);
  const recent = data?.filings?.recent;
  if (!recent?.form) throw new Error("no filings");
  const cutoff = Date.now() - 180 * 86400000;
  const form4s: { accession: string; doc: string; date: string }[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "4" && new Date(recent.filingDate[i]).getTime() >= cutoff) {
      form4s.push({ accession: String(recent.accessionNumber[i]).replace(/-/g, ""), doc: recent.primaryDocument[i], date: recent.filingDate[i] });
    }
  }

  // Parse direction from the few most recent Form 4 XMLs (best-effort).
  let buys = 0;
  let sells = 0;
  const cikNum = Number(cik);
  for (const f of form4s.slice(0, 4)) {
    try {
      // primaryDocument may carry an XSL rendering prefix (xslF345X05/...) — strip it to get raw XML.
      const rawDoc = f.doc.split("/").pop() ?? f.doc;
      const res = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${f.accession}/${rawDoc}`, {
        headers: UA,
        signal: timeout(9000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const codes = xml.match(/<transactionCode>([A-Z])<\/transactionCode>/g) ?? [];
      for (const c of codes) {
        if (c.includes(">P<")) buys++;
        else if (c.includes(">S<")) sells++;
      }
    } catch {
      continue;
    }
  }

  return { form4Count180d: form4s.length, buys, sells, lastFilingDate: form4s[0]?.date };
}

// ---------- Wikipedia discoverability ----------

async function wikiViews(companyName: string): Promise<WikiStat> {
  const cleaned = companyName.replace(/[.,]/g, "").replace(/\b(CORP|INC|LTD|PLC|CO|HOLDINGS|GROUP)\b\s*$/i, "").trim();
  const search = await getJson(
    `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(cleaned)}&limit=5&format=json`
  );
  const candidates: string[] = search?.[1] ?? [];
  if (candidates.length === 0) throw new Error("no wikipedia page");
  const lc = cleaned.toLowerCase();
  // Prefer exact match, then a corporate-sounding title, then first hit that isn't a place.
  const title =
    candidates.find((c) => c.toLowerCase() === lc) ??
    candidates.find((c) => /\b(corporation|company|inc|technologies|pharmaceuticals|mining|energy|lithium)\b/i.test(c)) ??
    candidates.find((c) => !/county|city|island|river|virginia/i.test(c)) ??
    candidates[0];
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}00`;
  const end = new Date(Date.now() - 86400000);
  const start = new Date(Date.now() - 61 * 86400000);
  const pv = await getJson(
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, "_"))}/daily/${fmt(start)}/${fmt(end)}`
  );
  const items: any[] = pv?.items ?? [];
  if (items.length === 0) throw new Error("no pageview data");
  const half = Date.now() - 31 * 86400000;
  let views30d = 0;
  let viewsPrev30d = 0;
  for (const it of items) {
    const ts = new Date(`${String(it.timestamp).slice(0, 4)}-${String(it.timestamp).slice(4, 6)}-${String(it.timestamp).slice(6, 8)}`).getTime();
    if (ts >= half) views30d += it.views ?? 0;
    else viewsPrev30d += it.views ?? 0;
  }
  return { title, views30d, viewsPrev30d };
}

// ---------- NASDAQ trade halts ----------

async function tradeHalts(ticker: string): Promise<HaltStat> {
  const res = await fetch("https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts", {
    headers: { ...UA, Accept: "application/xml" },
    signal: timeout(9000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xml = await res.text();
  const recent: { date: string; reason: string }[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null && recent.length < 5) {
    const item = m[1];
    const sym = item.match(/IssueSymbol>\s*([A-Z.\-]+)\s*</)?.[1];
    if (sym !== ticker.toUpperCase()) continue;
    recent.push({
      date: item.match(/HaltDate>\s*([^<]+?)\s*</)?.[1] ?? "",
      reason: item.match(/ReasonCode>\s*([^<]+?)\s*</)?.[1] ?? "unknown",
    });
  }
  return { count: recent.length, recent };
}

// ---------- OTC Markets (unofficial site API) ----------
// Same JSON the otcmarkets.com website calls. Unofficial: may change or block at volume.
// We make at most two requests per audit, cached upstream for 15 minutes — visitor-level traffic.
// For commercial scale, license OTC Markets' official data feed instead.

const OTC_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://www.otcmarkets.com/",
  Accept: "application/json",
};

async function otcMarkets(ticker: string): Promise<OtcStat> {
  const sym = encodeURIComponent(ticker.toUpperCase());
  const profile = await getJson(`https://backend.otcmarkets.com/otcapi/company/profile/full/${sym}?symbol=${sym}`, OTC_HEADERS);
  if (!profile || (!profile.tierDisplayName && !profile.tierGroup)) throw new Error("not an OTC-listed symbol");

  const out: OtcStat = {
    tier: profile.tierDisplayName || profile.tierName || profile.tierGroup,
    caveatEmptor: Boolean(profile.isCaveatEmptor ?? profile.caveatEmptor),
    website: profile.website || undefined,
    isAlternativeReporting: Boolean(profile.isAlternativeReporting),
    recentReports: [],
  };

  // Disclosure reports filed through OTC's own service (the non-EDGAR filings).
  try {
    const reports = await getJson(
      `https://backend.otcmarkets.com/otcapi/company/${sym}/financial-report?symbol=${sym}&page=1&pageSize=6&sortOn=releaseDate&sortDir=DESC`,
      OTC_HEADERS
    );
    const records: any[] = reports?.records ?? [];
    out.recentReports = records.slice(0, 6).map((r) => ({
      title: String(r.title ?? r.typeName ?? "Report").slice(0, 100),
      date: String(r.releaseDate ?? r.receivedDate ?? "").slice(0, 10),
    }));
  } catch {
    // profile alone is still useful
  }
  return out;
}

// ---------- Sector catalysts: clinical trials + federal contracts ----------

async function catalystScan(companyName: string): Promise<CatalystStat> {
  const cleaned = companyName.replace(/[.,]/g, "").replace(/\b(CORP|INC|LTD|PLC|CO)\b\s*$/i, "").trim();
  const out: CatalystStat = {};

  const [trialsR, contractsR] = await Promise.allSettled([
    getJson(`https://clinicaltrials.gov/api/v2/studies?query.spons=${encodeURIComponent(cleaned)}&pageSize=5&countTotal=true`),
    fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST",
      headers: { ...UA, "Content-Type": "application/json" },
      signal: timeout(9000),
      body: JSON.stringify({
        filters: {
          recipient_search_text: [cleaned],
          award_type_codes: ["A", "B", "C", "D"],
          time_period: [{ start_date: "2023-01-01", end_date: new Date().toISOString().slice(0, 10) }],
        },
        fields: ["Award ID", "Recipient Name", "Award Amount", "Description"],
        limit: 5,
      }),
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
  ]);

  if (trialsR.status === "fulfilled" && (trialsR.value?.totalCount ?? 0) > 0) {
    out.trials = {
      total: trialsR.value.totalCount,
      samples: (trialsR.value.studies ?? []).slice(0, 3).map((s: any) => ({
        title: String(s?.protocolSection?.identificationModule?.briefTitle ?? "").slice(0, 100),
        phase: (s?.protocolSection?.designModule?.phases ?? []).join("/") || "N/A",
        status: s?.protocolSection?.statusModule?.overallStatus ?? "",
      })),
    };
  }
  if (contractsR.status === "fulfilled" && (contractsR.value?.results?.length ?? 0) > 0) {
    const results: any[] = contractsR.value.results;
    out.contracts = {
      count: results.length,
      totalAmount: results.reduce((a, r) => a + (Number(r["Award Amount"]) || 0), 0),
      samples: results.slice(0, 3).map((r) => ({
        description: String(r.Description ?? "").slice(0, 100),
        amount: Number(r["Award Amount"]) || 0,
      })),
    };
  }
  return out;
}

// ---------- SEC full-text search: mentioned in OTHER companies' filings ----------

async function filingMentions(companyName: string, ownCik?: string): Promise<FilingMention[]> {
  const cleaned = companyName.replace(/[.,]/g, "").replace(/\b(CORP|INC|LTD|PLC|CO|HOLDINGS|GROUP)\b\s*$/i, "").trim();
  if (cleaned.length < 4) return [];
  const data = await getJson(
    `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(cleaned)}%22&forms=8-K,10-K,10-Q`
  );
  const hits: any[] = data?.hits?.hits ?? [];
  const out: FilingMention[] = [];
  const ownCikNum = ownCik ? Number(ownCik) : -1;
  const seen = new Set<string>();
  for (const h of hits) {
    const src = h?._source ?? {};
    const ciks: string[] = src?.ciks ?? [];
    if (ciks.some((c) => Number(c) === ownCikNum)) continue; // skip own filings
    const name = String(src?.display_names?.[0] ?? "Another filer").replace(/\s*\(CIK.*\)$/, "");
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({
      byCompany: name.slice(0, 80),
      form: src?.form ?? src?.root_forms?.[0] ?? "filing",
      date: src?.file_date ?? "",
      url: "https://efts.sec.gov/LATEST/search-index",
    });
    if (out.length >= 5) break;
  }
  return out;
}

// ---------- Wikidata: officers, founded, employees ----------

async function wikidataProfile(companyName: string): Promise<Partial<CompanyProfile>> {
  const cleaned = companyName.replace(/[.,]/g, "").replace(/\b(CORP|INC|LTD|PLC|CO|HOLDINGS|GROUP)\b\s*$/i, "").trim();
  // 1) find the entity id
  const search = await getJson(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(cleaned)}&language=en&type=item&limit=1&format=json&origin=*`
  );
  const id = search?.search?.[0]?.id;
  if (!id) throw new Error("no wikidata entity");
  const ent = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`);
  const claims = ent?.entities?.[id]?.claims ?? {};
  const out: Partial<CompanyProfile> = {};
  // P571 inception, P1128 employees, P856 official website
  const inception = claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
  if (inception) out.founded = String(inception).replace(/^\+/, "").slice(0, 4);
  const emp = claims?.P1128?.[0]?.mainsnak?.datavalue?.value?.amount;
  if (emp) out.employees = String(emp).replace(/^\+/, "");
  const site = claims?.P856?.[0]?.mainsnak?.datavalue?.value;
  if (site) out.website = String(site);
  return out;
}

// ---------- FDA openFDA: drug/device events ----------

async function fdaEvents(companyName: string): Promise<RegulatoryEvent[]> {
  const cleaned = companyName.replace(/[.,'"]/g, "").replace(/\b(CORP|INC|LTD|PLC|CO|HOLDINGS|GROUP)\b\s*$/i, "").trim();
  if (cleaned.length < 4) return [];
  const out: RegulatoryEvent[] = [];
  // Drug enforcement (recalls) by recalling firm.
  try {
    const recalls = await getJson(
      `https://api.fda.gov/drug/enforcement.json?search=recalling_firm:%22${encodeURIComponent(cleaned)}%22&limit=3`
    );
    for (const r of recalls?.results ?? []) {
      out.push({ source: "FDA", type: "Recall", title: String(r?.product_description ?? r?.reason_for_recall ?? "Recall").slice(0, 100), date: r?.recall_initiation_date ?? "" });
    }
  } catch {
    /* none */
  }
  return out;
}

// ---------- Scoring & findings ----------

function median(nums: number[]): number | undefined {
  if (nums.length === 0) return undefined;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function buildScore(a: Omit<TickerAudit, "score" | "grade" | "findings">): { score: number; grade: TickerAudit["grade"]; findings: string[] } {
  let score = 50;
  const findings: string[] = [];
  const { social, peers, filings, reddit, ticker } = a;

  const peerWatchers = peers.map((p) => p.watchers).filter((n): n is number => typeof n === "number");
  const medWatchers = median(peerWatchers);
  if (typeof social.watchers === "number" && typeof medWatchers === "number" && medWatchers > 0) {
    const ratio = social.watchers / medWatchers;
    if (ratio >= 1) {
      score += 15;
      findings.push(`Strong: ${social.watchers.toLocaleString()} StockTwits watchers — at or above your peer median (${medWatchers.toLocaleString()}).`);
    } else if (ratio >= 0.5) {
      score += 5;
      findings.push(`${social.watchers.toLocaleString()} watchers vs. a peer median of ${medWatchers.toLocaleString()} — visible, but the gap is real audience your peers have and you don't.`);
    } else {
      score -= 10;
      findings.push(`Visibility gap: ${social.watchers.toLocaleString()} watchers vs. a peer median of ${medWatchers.toLocaleString()} — investors tracking your sector mostly aren't tracking $${ticker}.`);
    }
  }

  if (typeof social.msgsPerDay === "number") {
    if (social.msgsPerDay >= 3) {
      score += 10;
      findings.push(`Active conversation: roughly ${social.msgsPerDay.toFixed(1)} StockTwits messages/day about $${ticker}.`);
    } else if (social.msgsPerDay < 0.2) {
      score -= 10;
      findings.push(`The conversation is nearly silent — under one message every 5 days. A quiet ticker reads as a dead ticker to retail screeners.`);
    }
  }
  if (typeof social.lastMessageAgeDays === "number" && social.lastMessageAgeDays > 14) {
    score -= 5;
    findings.push(`No one has mentioned $${ticker} on StockTwits in ${Math.round(social.lastMessageAgeDays)} days.`);
  }

  const rated = social.bullish + social.bearish;
  if (rated >= 5) {
    const bullPct = (social.bullish / rated) * 100;
    if (bullPct >= 60) {
      score += 10;
      findings.push(`Sentiment is on your side: ${bullPct.toFixed(0)}% of rated messages are bullish.`);
    } else if (bullPct < 40) {
      score -= 5;
      findings.push(`Sentiment risk: only ${bullPct.toFixed(0)}% of rated messages are bullish — the narrative is being written by skeptics.`);
    }
  }

  if (filings.lastFilingDate) {
    const age = (Date.now() - new Date(filings.lastFilingDate).getTime()) / 86400000;
    if (age <= 30) {
      score += 5;
      findings.push(`Fresh news to work with: a ${filings.lastForm} was filed ${Math.round(age)} days ago — prime material for investor content right now.`);
    }
  }
  if (filings.last12mo === 0) {
    score -= 5;
    findings.push("No SEC filings found in the last 12 months — verify the ticker/CIK mapping.");
  }

  const redditOk = a.sources.find((s) => s.name === "Reddit")?.ok ?? false;
  if (redditOk && reddit.postsFound >= 5) {
    score += 5;
    findings.push(`Reddit is already talking: ${reddit.postsFound} posts in the past year, mostly in ${reddit.topSubreddits.slice(0, 2).join(" and ")}.`);
  } else if (redditOk && reddit.postsFound === 0) {
    findings.push("Zero Reddit footprint in the past year — an untouched channel.");
  }

  if (social.topAccounts.length > 0 && social.topAccounts[0].followers >= 1000) {
    const t = social.topAccounts[0];
    findings.push(`Influencer lead: @${t.username} (${t.followers.toLocaleString()} followers) is already posting about $${ticker} — the warmest outreach target on this list.`);
  }

  const newsOk = a.sources.find((s) => s.name === "News (GDELT)")?.ok ?? false;
  if (newsOk) {
    if (a.news.articles30d >= 10) {
      score += 8;
      findings.push(`Media is covering you: ${a.news.articles30d} news articles in the last 30 days (${a.news.topOutlets.slice(0, 2).join(", ")}).`);
    } else if (a.news.articles30d === 0) {
      score -= 5;
      findings.push("Zero news coverage in the last 30 days — when investors search the company, they find nothing recent.");
    }
  }

  const fmtMoney = (n: number) =>
    Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

  if (a.fundamentals?.cash !== undefined) {
    if (typeof a.fundamentals.runwayQuarters === "number") {
      if (a.fundamentals.runwayQuarters < 4) {
        score -= 5;
        findings.push(`Cash runway: ~${a.fundamentals.runwayQuarters.toFixed(1)} quarters at the current loss rate (${fmtMoney(a.fundamentals.cash)} cash) — investors will price in a raise.`);
      } else {
        score += 3;
        findings.push(`Funded: ${fmtMoney(a.fundamentals.cash)} cash ≈ ${a.fundamentals.runwayQuarters.toFixed(1)} quarters of runway at the current loss rate.`);
      }
    } else {
      findings.push(`Balance sheet: ${fmtMoney(a.fundamentals.cash)} cash as of ${a.fundamentals.cashAsOf}.`);
    }
  }
  if (typeof a.fundamentals?.sharesChangePct1y === "number" && a.fundamentals.sharesChangePct1y > 25) {
    score -= 4;
    findings.push(`Dilution: share count grew ${a.fundamentals.sharesChangePct1y.toFixed(0)}% in the past year — the question every investor will ask.`);
  }

  if (a.insiders && a.insiders.form4Count180d > 0) {
    if (a.insiders.buys > a.insiders.sells) {
      score += 6;
      findings.push(`Insiders are buying: ${a.insiders.buys} open-market purchase transaction${a.insiders.buys > 1 ? "s" : ""} vs ${a.insiders.sells} sale${a.insiders.sells === 1 ? "" : "s"} in recent Form 4s — the strongest signal retail investors respond to.`);
    } else if (a.insiders.sells > a.insiders.buys && a.insiders.sells >= 3) {
      score -= 4;
      findings.push(`Insider selling: ${a.insiders.sells} sale transactions vs ${a.insiders.buys} buys in recent Form 4s.`);
    }
  }

  if (a.wiki) {
    if (a.wiki.viewsPrev30d > 0 && a.wiki.views30d > a.wiki.viewsPrev30d * 1.5) {
      score += 3;
      findings.push(`Discoverability rising: Wikipedia views up ${Math.round(((a.wiki.views30d - a.wiki.viewsPrev30d) / a.wiki.viewsPrev30d) * 100)}% month-over-month (${a.wiki.views30d.toLocaleString()} views).`);
    }
  }

  if (a.otc?.caveatEmptor) {
    score -= 15;
    findings.push(`🚨 OTC Markets has the Caveat Emptor (skull) flag on $${ticker} — the single biggest red flag in the OTC world. Resolving it is priority one.`);
  }
  if (a.otc?.tier) {
    findings.push(`OTC Markets tier: ${a.otc.tier}${a.otc.isAlternativeReporting ? " (alternative reporting — discloses via OTC, not EDGAR)" : ""}.`);
    if (a.otc.isAlternativeReporting && a.otc.recentReports.length > 0) {
      findings.push(`Latest OTC disclosure: "${a.otc.recentReports[0].title}" (${a.otc.recentReports[0].date}).`);
    }
  }

  if (a.halts && a.halts.count > 0) {
    score -= 8;
    findings.push(`⚠ Recent trade halt${a.halts.count > 1 ? "s" : ""}: ${a.halts.recent.map((h) => `${h.date} (${h.reason})`).join(", ")}.`);
  }

  if (a.catalysts?.trials) {
    findings.push(`Catalyst pipeline: ${a.catalysts.trials.total} registered clinical trial${a.catalysts.trials.total > 1 ? "s" : ""} on ClinicalTrials.gov — every status change is content.`);
  }
  if (a.catalysts?.contracts && a.catalysts.contracts.totalAmount > 0) {
    findings.push(`Federal contracts: ${fmtMoney(a.catalysts.contracts.totalAmount)} in awards since 2023 (USAspending.gov) — credibility most micro-caps never publicize.`);
  }

  if (a.shortData) {
    if (a.shortData.shortPct >= 60) {
      score -= 5;
      findings.push(`Short pressure: ${a.shortData.shortPct.toFixed(0)}% of yesterday's volume was sold short (FINRA daily file) — the bear side is leaning on the tape.`);
    } else if (a.shortData.shortPct <= 30) {
      score += 3;
      findings.push(`Low short pressure: only ${a.shortData.shortPct.toFixed(0)}% of yesterday's volume was short sales (FINRA).`);
    }
  }

  if (typeof a.market.avgVolume3mo === "number" && typeof a.market.lastVolume === "number" && a.market.avgVolume3mo > 0) {
    const volRatio = a.market.lastVolume / a.market.avgVolume3mo;
    if (volRatio >= 1.5) {
      score += 4;
      findings.push(`Trading volume is running ${volRatio.toFixed(1)}x the 3-month average — attention is converting into liquidity right now.`);
    } else if (volRatio < 0.4) {
      score -= 4;
      findings.push(`Trading volume is at ${(volRatio * 100).toFixed(0)}% of the 3-month average — the liquidity that supports your next raise is drying up.`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade: TickerAudit["grade"] = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  return { score, grade, findings };
}

// ---------- Orchestrator ----------

export async function runTickerAudit(ticker: string, peerTickers: string[]): Promise<TickerAudit> {
  const T = ticker.trim().toUpperCase();
  const peersIn = peerTickers.map((p) => p.trim().toUpperCase()).filter((p) => p && p !== T).slice(0, 5);
  const sources: AuditSource[] = [];

  // Company lookup first — GDELT searches by company name when available.
  let companyName: string | undefined;
  let cik: string | undefined;
  let companyLookupFailed = false;
  try {
    const c = await lookupCompany(T);
    if (c) {
      companyName = c.name;
      cik = c.cik;
    }
  } catch {
    companyLookupFailed = true;
  }

  const noCik = () => Promise.reject(new Error("no cik"));
  const noName = () => Promise.reject(new Error("no company name"));
  const [stR, redditR, marketR, newsR, filingsR, shortR, fundR, insiderR, wikiR, haltR, catalystR, otcR, mentionsR, wikidataR, fdaR, ...peerRs] = await Promise.allSettled([
    stocktwits(T),
    redditScan(T),
    yahooMarket(T),
    gdeltNews(T, companyName),
    cik ? filingStats(cik) : noCik(),
    finraShort(T),
    cik ? xbrlFundamentals(cik) : noCik(),
    cik ? insiderActivity(cik) : noCik(),
    companyName ? wikiViews(companyName) : noName(),
    tradeHalts(T),
    companyName ? catalystScan(companyName) : noName(),
    otcMarkets(T),
    companyName ? filingMentions(companyName, cik) : noName(),
    companyName ? wikidataProfile(companyName) : noName(),
    companyName ? fdaEvents(companyName) : noName(),
    ...peersIn.map((p) => stocktwits(p)),
  ]);

  // EDGAR company + filings + profile
  let filings: TickerAudit["filings"] = { last12mo: 0 };
  let profile: CompanyProfile | undefined;
  let recentFilings: FilingRef[] = [];
  if (cik && filingsR.status === "fulfilled") {
    filings = filingsR.value.stats;
    profile = filingsR.value.profile;
    recentFilings = filingsR.value.recentFilings;
    sources.push({ name: "SEC EDGAR", ok: true });
  } else if (cik) {
    sources.push({ name: "SEC EDGAR", ok: false, note: "Company found but filings fetch failed." });
  } else {
    sources.push({ name: "SEC EDGAR", ok: false, note: companyLookupFailed ? "EDGAR unreachable." : `No SEC registrant found for "${T}" — non-US listing?` });
  }

  // StockTwits
  const social: TickerAudit["social"] =
    stR.status === "fulfilled"
      ? stR.value
      : { bullish: 0, bearish: 0, unrated: 0, topAccounts: [], recentMessages: [] };
  sources.push({ name: "StockTwits", ok: stR.status === "fulfilled", note: stR.status === "rejected" ? "Unreachable or unknown symbol." : undefined });

  // Reddit
  const reddit: TickerAudit["reddit"] =
    redditR.status === "fulfilled" ? redditR.value : { postsFound: 0, topSubreddits: [], samples: [] };
  sources.push({ name: "Reddit", ok: redditR.status === "fulfilled", note: redditR.status === "rejected" ? "Blocked or rate-limited (try again in a minute)." : undefined });

  // Yahoo Finance market pulse
  const market: MarketStat = marketR.status === "fulfilled" ? marketR.value : {};
  sources.push({ name: "Market data", ok: marketR.status === "fulfilled", note: marketR.status === "rejected" ? "Quote service unreachable." : undefined });

  // GDELT news coverage
  const news: NewsStat = newsR.status === "fulfilled" ? newsR.value : { articles30d: 0, topOutlets: [], samples: [] };
  sources.push({ name: "News (GDELT)", ok: newsR.status === "fulfilled", note: newsR.status === "rejected" ? "News index unreachable." : undefined });

  // FINRA daily short volume (NMS with OTC fallback)
  const shortData: ShortStat | undefined = shortR.status === "fulfilled" ? shortR.value : undefined;
  sources.push({ name: "FINRA short volume", ok: shortR.status === "fulfilled", note: shortR.status === "rejected" ? "Symbol not in FINRA NMS or OTC files." : undefined });

  // XBRL fundamentals
  const fundamentals: Fundamentals | undefined = fundR.status === "fulfilled" ? fundR.value : undefined;
  sources.push({ name: "XBRL fundamentals", ok: fundR.status === "fulfilled", note: fundR.status === "rejected" ? "No structured financials on EDGAR." : undefined });

  // Insider Form 4s
  const insiders: InsiderStat | undefined = insiderR.status === "fulfilled" ? insiderR.value : undefined;
  sources.push({ name: "Insider Form 4s", ok: insiderR.status === "fulfilled", note: insiderR.status === "rejected" ? "Insider filings unavailable." : undefined });

  // Wikipedia pageviews
  const wiki: WikiStat | undefined = wikiR.status === "fulfilled" ? wikiR.value : undefined;
  sources.push({ name: "Wikipedia", ok: wikiR.status === "fulfilled", note: wikiR.status === "rejected" ? "No Wikipedia page found." : undefined });

  // Trade halts
  const halts: HaltStat | undefined = haltR.status === "fulfilled" ? haltR.value : undefined;
  sources.push({ name: "Trade halts", ok: haltR.status === "fulfilled", note: haltR.status === "rejected" ? "Halt feed unreachable." : undefined });

  // Sector catalysts (trials / federal contracts)
  const catalysts: CatalystStat | undefined = catalystR.status === "fulfilled" ? catalystR.value : undefined;
  sources.push({
    name: "Catalysts",
    ok: catalystR.status === "fulfilled",
    note: catalystR.status === "rejected" ? "ClinicalTrials/USAspending unreachable." : undefined,
  });

  // OTC Markets (only meaningful for OTC-traded symbols)
  const otc: OtcStat | undefined = otcR.status === "fulfilled" ? otcR.value : undefined;
  sources.push({
    name: "OTC Markets",
    ok: otcR.status === "fulfilled",
    note: otcR.status === "rejected" ? "OTC's open API was retired — disclosure data needs their licensed feed (or the company provides filings after claiming)." : undefined,
  });

  // SEC full-text search — mentioned in others' filings
  const filingMentionsResult: FilingMention[] = mentionsR.status === "fulfilled" ? mentionsR.value : [];
  sources.push({ name: "Filing mentions", ok: mentionsR.status === "fulfilled", note: mentionsR.status === "rejected" ? "SEC full-text search unreachable." : undefined });

  // Wikidata enrichment merges into the profile
  if (wikidataR.status === "fulfilled" && profile) {
    profile = { ...profile, ...wikidataR.value };
  } else if (wikidataR.status === "fulfilled" && !profile) {
    profile = wikidataR.value as CompanyProfile;
  }
  sources.push({ name: "Wikidata", ok: wikidataR.status === "fulfilled", note: wikidataR.status === "rejected" ? "No Wikidata entity found." : undefined });

  // FDA regulatory events
  const regulatory: RegulatoryEvent[] = fdaR.status === "fulfilled" ? fdaR.value : [];
  sources.push({ name: "FDA", ok: fdaR.status === "fulfilled", note: fdaR.status === "rejected" ? "openFDA unreachable." : undefined });

  // Peers
  const peers: PeerStat[] = peersIn.map((p, i) => {
    const r = peerRs[i];
    if (r.status === "fulfilled") return { ticker: p, watchers: r.value.watchers, msgsPerDay: r.value.msgsPerDay };
    return { ticker: p, error: "lookup failed" };
  });

  const base = {
    ticker: T,
    companyName,
    cik,
    generatedAt: new Date().toISOString(),
    sources,
    filings,
    profile,
    recentFilings,
    filingMentions: filingMentionsResult,
    regulatory,
    social,
    reddit,
    market,
    news,
    shortData,
    fundamentals,
    insiders,
    wiki,
    halts,
    catalysts,
    otc,
    peers,
  };
  const { score, grade, findings } = buildScore(base);
  return { ...base, score, grade, findings };
}

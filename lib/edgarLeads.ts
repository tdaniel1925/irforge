// Pull a list of recent SEC filers from EDGAR, enrich with the company's public
// profile (ticker, exchange, industry, phone, address) AND estimate market cap
// (shares outstanding from EDGAR XBRL × last price from our quote provider) so we
// can target SMALL-CAPS THAT ACTUALLY NEED THIS — not megacaps, banks, or funds.
//
// EDGAR has NO email addresses by design — we provide an "IR lookup" search link so
// the operator finds and verifies the real contact before any outreach is sent.
//
// EDGAR requires a descriptive User-Agent with a contact email (their fair-access
// policy) and rate-limiting to <10 req/s. We stay well under that.

import { getQuotes } from "./quotes";

const UA = {
  "User-Agent": process.env.EDGAR_USER_AGENT || "PubcoZone Research contact@pubcozone.com",
  Accept: "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (cik: string) => String(cik).replace(/\D/g, "").padStart(10, "0");

export type SizeTier = "nano" | "micro" | "small" | "mid" | "large" | "unknown";

export interface RawLead {
  cik: string;
  name: string;
  ticker: string;
  exchange: string;
  industry: string;
  phone: string;
  address: string;
  recentForm: string;
  edgarUrl: string;
  irLookupUrl: string;
  // Targeting signals
  marketCap?: number; // USD, estimated
  sizeTier: SizeTier;
  price?: number;
  fitScore: number; // 0–100; higher = better prospect for us
  fitReason: string; // short human explanation of the score
}

export interface LeadQuery {
  forms?: string[]; // e.g. ["8-K","10-Q"]
  limit?: number; // max leads RETURNED after filtering (default 30, hard cap 100)
  maxMarketCap?: number; // USD cap; default $500M (our sweet spot). 0 = no cap.
  smallCapOnly?: boolean; // if true, drop mid/large/unknown-cap entirely
}

// Industries we never want to target: SPACs/shells, funds, and (mostly) banks —
// banks have their own IR norms and rarely fit our product.
const EXCLUDE_INDUSTRY = /blank check|investment offices|investment trust|unit investment|commercial banks|savings instit|real estate investment trust|reits|finance services/i;

// Step 1: recent filers for a form type via EDGAR's "current events" Atom feed.
async function recentCiks(form: string, count = 100): Promise<string[]> {
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(form)}&company=&dateb=&owner=include&count=${count}&output=atom`;
  const xml = await fetch(url, { headers: UA }).then((r) => (r.ok ? r.text() : ""));
  const ciks: string[] = [];
  const entries = xml.split("<entry>").slice(1);
  for (const e of entries) {
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
    const cik = (link.match(/CIK=(\d+)/i) || link.match(/data\/(\d+)\//) || [])[1];
    if (cik) ciks.push(cik);
  }
  return ciks;
}

// Latest shares outstanding from EDGAR XBRL (dei:EntityCommonStockSharesOutstanding).
async function sharesOutstanding(cik: string): Promise<number | undefined> {
  try {
    const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${pad(cik)}/dei/EntityCommonStockSharesOutstanding.json`;
    const d = await fetch(url, { headers: UA }).then((r) => (r.ok ? r.json() : null));
    if (!d?.units) return undefined;
    const arr: { val?: number; end?: string }[] = d.units.shares || Object.values(d.units)[0] || [];
    const vals = arr.filter((x) => typeof x.val === "number" && x.val > 0);
    return vals.length ? vals[vals.length - 1].val : undefined;
  } catch {
    return undefined;
  }
}

function classify(cap?: number): SizeTier {
  if (cap == null) return "unknown";
  if (cap < 50e6) return "nano";
  if (cap < 300e6) return "micro";
  if (cap < 2e9) return "small";
  if (cap < 10e9) return "mid";
  return "large";
}

// Our ideal prospect: a nano/micro/small-cap on a major exchange that JUST filed
// (actively communicating). Score 0–100 with a short reason.
function scoreFit(lead: { sizeTier: SizeTier; exchange: string; recentForm: string; marketCap?: number }): { fitScore: number; fitReason: string } {
  let score = 40;
  const reasons: string[] = [];

  // Size — the core signal. The smaller (but still real), the more they need us.
  if (lead.sizeTier === "micro" || lead.sizeTier === "small") { score += 35; reasons.push(`${lead.sizeTier}-cap (underexposed)`); }
  else if (lead.sizeTier === "nano") { score += 25; reasons.push("nano-cap (very small)"); }
  else if (lead.sizeTier === "unknown") { score += 5; reasons.push("size unknown"); }
  else { score -= 25; reasons.push(`${lead.sizeTier}-cap (likely too big)`); }

  // Warmth — an 8-K means they're actively trying to communicate right now.
  if (lead.recentForm === "8-K") { score += 15; reasons.push("just filed 8-K (warm)"); }
  else if (lead.recentForm === "424B") { score += 12; reasons.push("recent offering (needs investors)"); }
  else if (lead.recentForm) { reasons.push(`recent ${lead.recentForm}`); }

  // Listing quality — major exchange = real company, reachable IR.
  if (/Nasdaq|NYSE/i.test(lead.exchange)) { score += 8; }
  else if (lead.exchange) { reasons.push("OTC/other listing"); }

  return { fitScore: Math.max(0, Math.min(100, score)), fitReason: reasons.join(" · ") };
}

export async function buildLeads(q: LeadQuery = {}): Promise<RawLead[]> {
  const forms = q.forms?.length ? q.forms : ["8-K", "10-Q"];
  const limit = Math.min(q.limit ?? 30, 100);
  const maxCap = q.maxMarketCap === 0 ? Infinity : q.maxMarketCap ?? 500e6;
  const smallCapOnly = q.smallCapOnly ?? true;

  // Gather a deduped pool of recent filers (oversample so filtering still yields enough).
  const pool = new Map<string, string>(); // cik -> first form seen
  for (const form of forms) {
    const ciks = await recentCiks(form);
    for (const c of ciks) if (!pool.has(c)) pool.set(c, form);
    await sleep(200);
  }

  // Enrich the candidate pool (cap the number we deeply enrich to bound time/requests).
  const ENRICH_CAP = Math.min(pool.size, Math.max(limit * 3, 60));
  const candidates: RawLead[] = [];
  let processed = 0;
  for (const [cik, form] of Array.from(pool.entries())) {
    if (processed >= ENRICH_CAP) break;
    processed++;
    try {
      const d = await fetch(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, { headers: UA }).then((r) => (r.ok ? r.json() : null));
      await sleep(90);
      if (!d) continue;
      const ticker = (d.tickers || [])[0];
      if (!ticker) continue; // must be publicly traded
      const industry = d.sicDescription || "";
      if (EXCLUDE_INDUSTRY.test(industry)) continue; // drop SPACs/funds/banks/REITs
      const a = d.addresses?.business || {};
      candidates.push({
        cik: pad(cik),
        name: d.name || "",
        ticker,
        exchange: (d.exchanges || []).join("|"),
        industry,
        phone: d.phone || "",
        address: [a.street1, a.street2, a.city, a.stateOrCountry, a.zipCode].filter(Boolean).join(", "),
        recentForm: form,
        edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${pad(cik)}&type=&owner=include&count=20`,
        irLookupUrl: `https://www.google.com/search?q=${encodeURIComponent((d.name || "") + " investor relations contact email")}`,
        sizeTier: "unknown",
        fitScore: 0,
        fitReason: "",
      });
    } catch {
      // skip single-company failure
    }
  }

  // Market cap = shares (EDGAR) × price (quote provider). Batch the price calls.
  const quotes = await getQuotes(candidates.map((c) => c.ticker));
  for (const c of candidates) {
    const px = quotes[c.ticker.toUpperCase()]?.price;
    if (px != null) {
      const shares = await sharesOutstanding(c.cik);
      await sleep(80);
      if (shares != null) c.marketCap = px * shares;
      c.price = px;
    }
    c.sizeTier = classify(c.marketCap);
    const fit = scoreFit(c);
    c.fitScore = fit.fitScore;
    c.fitReason = fit.fitReason;
  }

  // Filter by size, then rank best-fit first, then trim to the limit.
  const filtered = candidates.filter((c) => {
    if (c.marketCap != null && c.marketCap > maxCap) return false;
    if (smallCapOnly && (c.sizeTier === "mid" || c.sizeTier === "large")) return false;
    return true;
  });
  filtered.sort((a, b) => b.fitScore - a.fitScore);
  return filtered.slice(0, limit);
}

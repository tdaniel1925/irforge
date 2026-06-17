import type { Company } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Fund Finder — REAL institutional-investor research from SEC data.
//
// Approach (no hallucinated contacts):
//  1. peer ticker -> CIK (SEC company_tickers.json)
//  2. EDGAR full-text search for 13F-HR filings that mention the peer -> the FUNDS
//     that report holding it (real filer name + CIK)
//  3. each fund CIK -> SEC submissions JSON -> real business ADDRESS + PHONE + the
//     EDGAR filer page (where their 13F history and Form ADV link live)
//
// AI only writes the outreach note + fit summary — it never invents emails/phones.
// Email is intentionally NOT fabricated; we provide the verifiable contact PATH
// (address, phone, EDGAR page, SEC IAPD/ADV search) the company uses to confirm it.
// ─────────────────────────────────────────────────────────────────────────────

const UA = { "User-Agent": "PubcoZone IR research contact@pubcozone.com", Accept: "application/json" };

function timeout(ms: number) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: UA, signal: timeout(9000), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let tickerMap: Record<string, { cik_str: number; title: string }> | null = null;
async function tickerToCik(ticker: string): Promise<string | null> {
  if (!tickerMap) {
    try {
      const raw = (await getJson("https://www.sec.gov/files/company_tickers.json")) as Record<string, { cik_str: number; title: string; ticker: string }>;
      tickerMap = {};
      for (const k of Object.keys(raw)) tickerMap[String(raw[k].ticker).toUpperCase()] = raw[k];
    } catch {
      return null;
    }
  }
  const hit = tickerMap[ticker.toUpperCase()];
  return hit ? String(hit.cik_str).padStart(10, "0") : null;
}

export interface FundResearch {
  fund: string;
  cik: string;
  type: string;            // "13F Institutional Manager"
  peersHeld: string[];     // which of the company's peers this filer reported
  address: string;         // real business address from SEC submissions
  phone: string;           // real phone from SEC submissions (may be empty)
  edgarUrl: string;        // EDGAR filer page (13F history)
  advSearchUrl: string;    // SEC IAPD search prefilled with the firm name (find ADV + contacts)
  lastFiling: string;      // most recent filing date on record
}

// Find the funds (13F filers) that reported holding a peer ticker.
async function filersHolding(peer: string): Promise<{ name: string; cik: string }[]> {
  const cik = await tickerToCik(peer);
  if (!cik) return [];
  // Full-text search across 13F-HR filings mentioning the peer's CIK/ticker.
  const q = encodeURIComponent(`"${peer}"`);
  let data: unknown;
  try {
    data = await getJson(`https://efts.sec.gov/LATEST/search-index?q=${q}&forms=13F-HR`);
  } catch {
    return [];
  }
  const hits = (data as { hits?: { hits?: { _source?: { display_names?: string[]; ciks?: string[] } }[] } })?.hits?.hits ?? [];
  const out: { name: string; cik: string }[] = [];
  const seen = new Set<string>();
  for (const h of hits) {
    const src = h?._source ?? {};
    const name = String(src?.display_names?.[0] ?? "").replace(/\s*\(CIK[^)]*\)\s*$/i, "").trim();
    const fcik = (src?.ciks ?? [])[0];
    if (!name || !fcik || seen.has(fcik)) continue;
    seen.add(fcik);
    out.push({ name: name.slice(0, 120), cik: String(fcik).padStart(10, "0") });
    if (out.length >= 12) break;
  }
  return out;
}

// Enrich a filer with real address/phone from SEC submissions.
async function enrichFiler(name: string, cik: string, peersHeld: string[]): Promise<FundResearch> {
  const cikNum = Number(cik);
  const edgarUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F&dateb=&owner=include&count=40`;
  const advSearchUrl = `https://adviserinfo.sec.gov/search/genericsearch/grid?searchText=${encodeURIComponent(name)}`;
  let address = "";
  let phone = "";
  let lastFiling = "";
  let realName = name;
  try {
    const data = (await getJson(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
      name?: string;
      phone?: string;
      addresses?: { business?: { street1?: string; street2?: string; city?: string; stateOrCountry?: string; zipCode?: string } };
      filings?: { recent?: { filingDate?: string[] } };
    };
    realName = data?.name || name;
    phone = data?.phone || "";
    const b = data?.addresses?.business;
    if (b) {
      address = [b.street1, b.street2, [b.city, b.stateOrCountry, b.zipCode].filter(Boolean).join(", ")].filter(Boolean).join(", ");
    }
    lastFiling = data?.filings?.recent?.filingDate?.[0] ?? "";
  } catch {
    /* address/phone stay empty — the EDGAR/ADV links still give a contact path */
  }
  return {
    fund: realName.slice(0, 120),
    cik,
    type: "13F Institutional Manager",
    peersHeld,
    address,
    phone,
    edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cikNum}&type=13F&dateb=&owner=include&count=40`,
    advSearchUrl,
    lastFiling,
  };
}

// Main entry: real funds holding the company's peers, with real contact paths.
export async function findRealFunds(company: Company): Promise<FundResearch[]> {
  const peers = (company.peers ?? []).map((p) => p.toUpperCase().trim()).filter(Boolean).slice(0, 4);
  if (peers.length === 0) return [];

  // Map fund CIK -> { name, peersHeld[] } across all peers.
  const byCik = new Map<string, { name: string; peers: Set<string> }>();
  for (const peer of peers) {
    const filers = await filersHolding(peer);
    for (const f of filers) {
      const cur = byCik.get(f.cik);
      if (cur) cur.peers.add(peer);
      else byCik.set(f.cik, { name: f.name, peers: new Set([peer]) });
    }
  }

  // Prefer funds that hold MORE of the peers (stronger fit), cap the enrichment count.
  const ranked = Array.from(byCik.entries())
    .sort((a, b) => b[1].peers.size - a[1].peers.size)
    .slice(0, 10);

  const enriched: FundResearch[] = [];
  for (const [cik, v] of ranked) {
    enriched.push(await enrichFiler(v.name, cik, Array.from(v.peers)));
  }
  return enriched;
}

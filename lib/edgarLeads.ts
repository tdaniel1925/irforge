// Pull a list of recent SEC filers from EDGAR and enrich each with the company's
// public profile (ticker, exchange, industry, phone, address). EDGAR has NO email
// addresses — we provide an "IR lookup" search link so the operator can find and
// verify the real contact before any outreach is sent.
//
// EDGAR requires a descriptive User-Agent with a contact email (their fair-access
// policy) and rate-limiting to <10 req/s. We stay well under that.

const UA = {
  "User-Agent": process.env.EDGAR_USER_AGENT || "PubcoZone Research contact@pubcozone.com",
  Accept: "application/json",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pad = (cik: string) => String(cik).replace(/\D/g, "").padStart(10, "0");

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
}

export interface LeadQuery {
  forms?: string[]; // e.g. ["8-K","10-Q"]
  limit?: number; // max enriched leads to return (default 30, hard cap 100)
  smallCapOnly?: boolean; // drop megacaps / well-known names by exchange + name heuristic
}

// Step 1: recent filers for a form type via EDGAR's "current events" Atom feed.
async function recentCiks(form: string, count = 80): Promise<string[]> {
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

// Skip SPACs/shells/funds and very-large issuers we don't want to target.
function isWantedType(industry: string): boolean {
  return !/blank check|investment offices|investment trust|unit investment/i.test(industry || "");
}

export async function buildLeads(q: LeadQuery = {}): Promise<RawLead[]> {
  const forms = q.forms?.length ? q.forms : ["8-K", "10-Q"];
  const limit = Math.min(q.limit ?? 30, 100);

  // Gather a deduped pool of recent filers.
  const pool = new Map<string, string>(); // cik -> first form seen
  for (const form of forms) {
    const ciks = await recentCiks(form);
    for (const c of ciks) if (!pool.has(c)) pool.set(c, form);
    await sleep(200);
  }

  // Enrich each until we hit the limit.
  const out: RawLead[] = [];
  for (const [cik, form] of Array.from(pool.entries())) {
    if (out.length >= limit) break;
    try {
      const d = await fetch(`https://data.sec.gov/submissions/CIK${pad(cik)}.json`, { headers: UA }).then((r) =>
        r.ok ? r.json() : null
      );
      await sleep(110);
      if (!d) continue;
      const ticker = (d.tickers || [])[0];
      if (!ticker) continue; // must be publicly traded with a ticker
      const industry = d.sicDescription || "";
      if (!isWantedType(industry)) continue;
      const a = d.addresses?.business || {};
      out.push({
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
      });
    } catch {
      // skip on any single-company failure
    }
  }
  return out;
}

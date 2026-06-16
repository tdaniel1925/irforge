import type { TickerAudit } from "./audit";

// Truth-check / reality-check for board posts.
// Extracts any factual/quantitative claim about the company (cash, runway, dilution,
// halts, insiders, short, filings) and compares it ONLY against the supplied live
// audit facts, citing the FINRA/EDGAR/XBRL source the figure came from.
//
// Cheap/high-volume path per CLAUDE.md: uses Haiku, not Sonnet. Self-contained fetch
// (does NOT touch lib/ai.ts), with the same JSON-match + template-fallback pattern.
//
// COMPLIANCE: facts only. Never says buy/sell, never rates the post's investment merit.
// Only "the public record shows X". "unverifiable" means the filings neither confirm
// nor deny — it must never imply the poster is lying.

const MODEL = "claude-haiku-4-5";

export interface TruthCitation {
  label: string;
  url?: string;
}

export interface TruthCheckResult {
  checkable: boolean;
  verdict: "supported" | "contradicted" | "unverifiable";
  claim: string;
  reality: string;
  citations: TruthCitation[];
  engine: "claude" | "template";
}

async function haiku(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

const fmtMoney = (n: number) =>
  Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

// Flatten the audit into the only facts the model (and the template fallback) may use.
// Each line carries its source so the model can cite FINRA/EDGAR/XBRL precisely.
function auditFacts(audit: TickerAudit): string[] {
  const f: string[] = [];
  const t = audit.ticker;
  if (audit.fundamentals?.cash !== undefined) {
    f.push(`[XBRL/EDGAR] Cash & equivalents: ${fmtMoney(audit.fundamentals.cash)}${audit.fundamentals.cashAsOf ? ` as of ${audit.fundamentals.cashAsOf}` : ""}.`);
  }
  if (typeof audit.fundamentals?.runwayQuarters === "number") {
    f.push(`[XBRL/EDGAR] Cash runway: ~${audit.fundamentals.runwayQuarters.toFixed(1)} quarters at the current loss rate.`);
  }
  if (typeof audit.fundamentals?.sharesChangePct1y === "number") {
    f.push(`[XBRL/EDGAR] Shares outstanding changed ${audit.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${audit.fundamentals.sharesChangePct1y.toFixed(1)}% over the past year (dilution signal).`);
  }
  if (typeof audit.fundamentals?.sharesOutstanding === "number") {
    f.push(`[XBRL/EDGAR] Shares outstanding: ${audit.fundamentals.sharesOutstanding.toLocaleString()}.`);
  }
  if (typeof audit.fundamentals?.revenueAnnual === "number") {
    f.push(`[XBRL/EDGAR] Annual revenue: ${fmtMoney(audit.fundamentals.revenueAnnual)}.`);
  }
  if (typeof audit.fundamentals?.netIncomeAnnual === "number") {
    f.push(`[XBRL/EDGAR] Annual net income: ${fmtMoney(audit.fundamentals.netIncomeAnnual)}.`);
  }
  if (audit.insiders) {
    f.push(`[Form 4/EDGAR] Insider transactions in last 180 days: ${audit.insiders.buys} open-market buy(s) vs ${audit.insiders.sells} sale(s) across ${audit.insiders.form4Count180d} Form 4s.`);
  }
  if (audit.shortData) {
    f.push(`[FINRA] ${audit.shortData.shortPct.toFixed(1)}% of ${audit.shortData.venue} volume was sold short on ${audit.shortData.date} (daily short volume, not short interest).`);
  }
  if (audit.halts) {
    f.push(`[NASDAQ] ${audit.halts.count} recent trade halt(s)${audit.halts.recent.length ? `: ${audit.halts.recent.map((h) => `${h.date} (${h.reason})`).join(", ")}` : ""}.`);
  }
  if (audit.filings) {
    f.push(`[EDGAR] ${audit.filings.last12mo} SEC filing(s) in the last 12 months${audit.filings.lastForm ? `; latest ${audit.filings.lastForm} on ${audit.filings.lastFilingDate}` : ""}.`);
  }
  if (audit.recentFilings?.length) {
    f.push(`[EDGAR] Recent filings: ${audit.recentFilings.slice(0, 5).map((r) => `${r.form} (${r.date})`).join(", ")}.`);
  }
  if (typeof audit.market.price === "number") {
    f.push(`[Market] Last price ~$${audit.market.price}${typeof audit.market.changePct3mo === "number" ? `, ${audit.market.changePct3mo >= 0 ? "+" : ""}${audit.market.changePct3mo.toFixed(1)}% over 3 months` : ""}.`);
  }
  if (typeof audit.market.lastVolume === "number" && typeof audit.market.avgVolume3mo === "number" && audit.market.avgVolume3mo > 0) {
    f.push(`[Market] Last session volume ${(audit.market.lastVolume / audit.market.avgVolume3mo).toFixed(1)}x the 3-month average.`);
  }
  if (audit.otc?.tier) {
    f.push(`[OTC Markets] Tier: ${audit.otc.tier}${audit.otc.caveatEmptor ? " — Caveat Emptor flag present" : ""}.`);
  }
  if (f.length === 0) f.push(`No structured public-record facts were retrieved for $${t} in this audit.`);
  return f;
}

// Citations come straight from the audit so they always link to a real EDGAR/FINRA source.
function auditCitations(audit: TickerAudit): TruthCitation[] {
  const cites: TruthCitation[] = [];
  for (const r of (audit.recentFilings ?? []).slice(0, 3)) {
    cites.push({ label: `EDGAR: ${r.form} (${r.date})`, url: r.url });
  }
  if (audit.shortData) {
    cites.push({ label: `FINRA daily short volume (${audit.shortData.date})`, url: "https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data" });
  }
  if (audit.fundamentals?.cash !== undefined || typeof audit.fundamentals?.sharesChangePct1y === "number") {
    cites.push({ label: "SEC XBRL company facts", url: audit.cik ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${audit.cik}&type=10-K` : undefined });
  }
  if (cites.length === 0 && audit.cik) {
    cites.push({ label: `SEC EDGAR filings — CIK ${audit.cik}`, url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${audit.cik}&type=&dateb=&owner=include&count=40` });
  }
  return cites.slice(0, 4);
}

const VALID_VERDICTS = ["supported", "contradicted", "unverifiable"];

export async function truthCheckPost(text: string, audit: TickerAudit): Promise<TruthCheckResult> {
  const facts = auditFacts(audit);
  const citations = auditCitations(audit);

  const system =
    `You are PubcoZone's reality-check engine for a compliance-first investor message board. ` +
    `A user wrote a post about $${audit.ticker}${audit.companyName ? ` (${audit.companyName})` : ""}. ` +
    `STEP 1: Identify any FACTUAL or QUANTITATIVE claim about the company — cash, runway, dilution/share count, trade halts, insider buying/selling, short selling, filings, revenue, price/volume. ` +
    `If the post contains NO checkable factual claim (pure opinion, hype, sentiment, or chatter), respond with {"checkable": false}. ` +
    `STEP 2: Compare that claim ONLY against the SUPPLIED PUBLIC-RECORD FACTS below. Use NOTHING else. Do not bring in outside knowledge. ` +
    `Decide a verdict: "supported" (the public record agrees), "contradicted" (the public record shows otherwise), or "unverifiable" (the supplied filings neither confirm nor deny it). ` +
    `STRICT COMPLIANCE: facts only. NEVER say buy/sell/hold. NEVER rate whether the post is good investment advice or whether the stock is a good/bad buy. NEVER call the poster a liar — "unverifiable" means the record is silent, not that they are wrong. ` +
    `Phrase "reality" as "The public record shows…". Cite the FINRA/EDGAR/XBRL source the figure came from. ` +
    `Respond ONLY with JSON: {"checkable": true, "verdict": "supported|contradicted|unverifiable", "claim": "the claim you extracted", "reality": "what the public record shows", "citations": ["source label", ...]}.`;

  const user =
    `POST:\n${text}\n\n` +
    `PUBLIC-RECORD FACTS (the only ground truth you may use):\n${facts.join("\n")}`;

  const ai = await haiku(system, user);
  if (ai) {
    try {
      const m = ai.match(/\{[\s\S]*\}/);
      if (m) {
        const v = JSON.parse(m[0]);
        if (v.checkable === false) {
          return { checkable: false, verdict: "unverifiable", claim: "", reality: "", citations: [], engine: "claude" };
        }
        const verdict: TruthCheckResult["verdict"] = VALID_VERDICTS.includes(v.verdict) ? v.verdict : "unverifiable";
        // Only attach sources when the public record actually spoke to the claim
        // (supported/contradicted). For "unverifiable" the record was silent, so
        // citing EDGAR/FINRA would imply substantiation that doesn't exist. The
        // model is constrained to ONLY the supplied audit facts, so the audit-
        // derived URLs are the genuine sources behind a supported/contradicted call.
        const showCitations = verdict === "supported" || verdict === "contradicted";
        return {
          checkable: true,
          verdict,
          claim: String(v.claim ?? "").slice(0, 300),
          reality: String(v.reality ?? "").slice(0, 600),
          citations: showCitations ? citations : [],
          engine: "claude",
        };
      }
    } catch {
      /* fall through to template */
    }
  }

  // Template fallback (no API key or parse failure): never invents a verdict on the
  // post's wording — it surfaces the relevant public-record facts and stays "unverifiable".
  return {
    checkable: true,
    verdict: "unverifiable",
    claim: text.slice(0, 200),
    reality:
      `Reality-check unavailable right now, so this can't be matched to a specific claim. ` +
      `Here is what the public record currently shows for $${audit.ticker}: ${facts.slice(0, 4).join(" ")}`,
    citations: [], // unverifiable → no sources implied
    engine: "template",
  };
}

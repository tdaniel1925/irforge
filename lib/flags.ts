import type { TickerAudit } from "./audit";

export interface PlainFlag {
  tone: "good" | "warn" | "bad" | "info";
  text: string;
}

// Turn the raw audit into a handful of plain-English signals a retail investor
// can read at a glance — the stuff buried in XBRL/Form 4/FINRA, said simply.
// Neutral and factual: no predictions, no buy/sell, no valuation calls.
export function buildPlainFlags(a: TickerAudit): PlainFlag[] {
  const flags: PlainFlag[] = [];
  const f = a.fundamentals;

  // Cash runway
  if (typeof f?.runwayQuarters === "number") {
    if (f.runwayQuarters >= 8) {
      flags.push({ tone: "good", text: `Healthy cash position — roughly ${f.runwayQuarters.toFixed(0)} quarters of runway at the latest loss rate.` });
    } else if (f.runwayQuarters >= 4) {
      flags.push({ tone: "info", text: `About ${f.runwayQuarters.toFixed(0)} quarters of cash runway at the latest loss rate.` });
    } else {
      flags.push({ tone: "warn", text: `Short runway — only ~${f.runwayQuarters.toFixed(1)} quarters of cash at the latest loss rate. Watch for a raise.` });
    }
  } else if (typeof f?.netIncomeAnnual === "number" && f.netIncomeAnnual >= 0) {
    flags.push({ tone: "good", text: "Profitable on the latest annual figures — not burning cash." });
  }

  // Dilution
  if (typeof f?.sharesChangePct1y === "number") {
    if (f.sharesChangePct1y >= 25) {
      flags.push({ tone: "warn", text: `Heavy dilution — share count is up ${f.sharesChangePct1y.toFixed(0)}% in the last year. Each share owns less of the company.` });
    } else if (f.sharesChangePct1y >= 10) {
      flags.push({ tone: "info", text: `Share count rose ${f.sharesChangePct1y.toFixed(0)}% over the past year (some dilution).` });
    } else if (f.sharesChangePct1y <= 0) {
      flags.push({ tone: "good", text: `No dilution — share count held flat or shrank over the past year.` });
    }
  }

  // Insider activity
  if (a.insiders && (a.insiders.buys > 0 || a.insiders.sells > 0)) {
    if (a.insiders.buys > a.insiders.sells) {
      flags.push({ tone: "good", text: `Insiders are net buyers — ${a.insiders.buys} open-market buys vs ${a.insiders.sells} sells in the last 180 days.` });
    } else if (a.insiders.sells > a.insiders.buys * 2 && a.insiders.sells >= 3) {
      flags.push({ tone: "warn", text: `Insiders are net sellers — ${a.insiders.sells} sells vs ${a.insiders.buys} buys in the last 180 days.` });
    }
  }

  // Short interest
  if (a.shortData && a.shortData.shortPct >= 40) {
    flags.push({ tone: "info", text: `Elevated short volume — ${a.shortData.shortPct.toFixed(0)}% of recent daily volume was short-marked (includes market-making, not just bets against it).` });
  }

  // Filing cadence / transparency
  if (a.filings.last12mo === 0 && a.cik) {
    flags.push({ tone: "warn", text: "No SEC filings in the last 12 months — limited recent disclosure for investors." });
  } else if (a.filings.last12mo >= 8) {
    flags.push({ tone: "good", text: `Active filer — ${a.filings.last12mo} SEC filings in the last 12 months.` });
  }

  // Caveat emptor / halts — hard risk signals always surface
  if (a.otc?.caveatEmptor) {
    flags.push({ tone: "bad", text: "🚨 OTC Caveat Emptor flag — the exchange has posted a public-interest warning. Investigate before doing anything." });
  }
  if (a.halts && a.halts.count > 0) {
    flags.push({ tone: "bad", text: `Trading was halted ${a.halts.count} time${a.halts.count > 1 ? "s" : ""} recently — a sign of unusual volatility or pending news.` });
  }

  // Liquidity / attention context
  if (typeof a.social.watchers === "number" && a.social.watchers < 50 && a.filings.last12mo > 0) {
    flags.push({ tone: "info", text: `Under the radar — only ${a.social.watchers} StockTwits watchers despite being an active SEC filer.` });
  }

  // Keep it scannable: most relevant first, cap at 6.
  const order: Record<PlainFlag["tone"], number> = { bad: 0, warn: 1, good: 2, info: 3 };
  return flags.sort((x, y) => order[x.tone] - order[y.tone]).slice(0, 6);
}

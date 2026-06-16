import type { CompanyStatRow } from "./companyStats";

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio X-Ray — a PURE, deterministic, facts-only transform of company_stats
// rows for a member's watched tickers.
//
// COMPLIANCE: This is a FACTS x-ray, not advice. It surfaces only neutral public
// figures (dilution, runway, short-volume %, insider net, volume) and neutral
// fact flags ("share count +40% in 1y"). It does NOT score, rank, or judge any
// holding as best/worst/risky, and never says reduce/trim/sell. "Here's what the
// filings say" — research, not recommendations.
// ─────────────────────────────────────────────────────────────────────────────

// Thresholds at which a neutral fact flag is worth surfacing. These are display
// thresholds for "is this figure notable enough to call out", NOT risk verdicts.
const DILUTION_FLAG_PCT = 20;   // share count up >20% in 1y
const LOW_RUNWAY_QUARTERS = 4;  // runway under 4 quarters
// NOTE: short_pct is daily short-VOLUME % (FINRA daily file), NOT short interest as
// a % of float. Short-volume % routinely runs 40-60%, so only call it out when
// it's genuinely elevated, and label it precisely.
const HIGH_SHORT_VOLUME_PCT = 65;

export interface XrayHolding {
  ticker: string;
  companyName: string;
  dilutionPct1y: number | null;
  runwayQuarters: number | null;
  shortPct: number | null;
  insiderNet: number;
  volumeRatio: number | null;
  flags: string[];
}

export interface PortfolioXray {
  holdings: XrayHolding[];
  portfolio: {
    count: number;
    dilutingCount: number;
    lowRunwayCount: number;
    highShortCount: number;
    notes: string[];
  };
}

function buildFlags(row: CompanyStatRow): string[] {
  const flags: string[] = [];

  if (row.shares_change_pct_1y != null && row.shares_change_pct_1y >= DILUTION_FLAG_PCT) {
    flags.push(`Share count +${Math.round(row.shares_change_pct_1y)}% in 1y`);
  }
  if (row.runway_quarters != null && row.runway_quarters < LOW_RUNWAY_QUARTERS) {
    const q = Math.round(row.runway_quarters * 10) / 10;
    flags.push(`Cash runway under ${LOW_RUNWAY_QUARTERS} quarters (~${q})`);
  }
  if (row.short_pct != null && row.short_pct >= HIGH_SHORT_VOLUME_PCT) {
    flags.push(`Elevated short-volume: ${Math.round(row.short_pct)}% of daily volume sold short`);
  }
  if (row.insider_net < 0) {
    flags.push(`Net insider selling (${row.insider_net} net Form 4s)`);
  } else if (row.insider_net > 0) {
    flags.push(`Net insider buying (+${row.insider_net} net Form 4s)`);
  }
  if (row.volume_ratio != null && row.volume_ratio >= 2) {
    flags.push(`Volume ${row.volume_ratio}x its 3-month average`);
  }
  if (row.halts_count > 0) {
    flags.push(`${row.halts_count} trading halt${row.halts_count === 1 ? "" : "s"} on record`);
  }

  return flags;
}

// PURE transform. Tolerates a partial row set (watched tickers with no snapshot
// row are simply absent — the page surfaces those separately as "not in snapshot").
export function buildPortfolioXray(rows: CompanyStatRow[]): PortfolioXray {
  const holdings: XrayHolding[] = rows.map((row) => ({
    ticker: row.ticker.toUpperCase(),
    companyName: row.company_name ?? "",
    dilutionPct1y: row.shares_change_pct_1y,
    runwayQuarters: row.runway_quarters,
    shortPct: row.short_pct,
    insiderNet: row.insider_net ?? 0,
    volumeRatio: row.volume_ratio,
    flags: buildFlags(row),
  }));

  const dilutingCount = holdings.filter(
    (h) => h.dilutionPct1y != null && h.dilutionPct1y >= DILUTION_FLAG_PCT,
  ).length;
  const lowRunwayCount = holdings.filter(
    (h) => h.runwayQuarters != null && h.runwayQuarters < LOW_RUNWAY_QUARTERS,
  ).length;
  const highShortCount = holdings.filter(
    (h) => h.shortPct != null && h.shortPct >= HIGH_SHORT_VOLUME_PCT,
  ).length;

  // Neutral count-of-facts notes only — no ranking, no verdict.
  const notes: string[] = [];
  if (holdings.length > 0) {
    if (dilutingCount > 0) {
      notes.push(`${dilutingCount} of ${holdings.length} holdings show share count up ${DILUTION_FLAG_PCT}%+ over the past year.`);
    }
    if (lowRunwayCount > 0) {
      notes.push(`${lowRunwayCount} of ${holdings.length} holdings report cash runway under ${LOW_RUNWAY_QUARTERS} quarters.`);
    }
    if (highShortCount > 0) {
      notes.push(`${highShortCount} of ${holdings.length} holdings show elevated short-volume (${HIGH_SHORT_VOLUME_PCT}%+ of daily volume sold short — note: short volume, not short interest).`);
    }
    if (notes.length === 0) {
      notes.push("None of your holdings in our snapshot crossed the dilution, runway, or short-interest fact thresholds.");
    }
  }

  return {
    holdings,
    portfolio: {
      count: holdings.length,
      dilutingCount,
      lowRunwayCount,
      highShortCount,
      notes,
    },
  };
}

// ── Optional cheap Haiku narrative (facts-summary only) ──
// Uses its own fetch (per spec; lib/ai.ts is owned by another feature and must
// not be touched). MANDATORY template fallback: any failure / missing key returns
// the deterministic join of the precomputed neutral notes. Never advice.
export async function narratePortfolioXray(xray: PortfolioXray): Promise<string> {
  const fallback = xray.portfolio.notes.join(" ") ||
    "No holdings from your watchlist are in our current data snapshot.";

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || xray.holdings.length === 0) return fallback;

  const system =
    "You summarize a stock watchlist's PUBLIC FACTS for an investor-relations tool. " +
    "STRICT RULES: state ONLY the facts given. NEVER give advice, NEVER say buy/sell/trim/reduce/hold, " +
    "NEVER rank holdings best/worst, NEVER call anything risky/undervalued, NEVER predict price. " +
    "Write 1-2 neutral sentences describing what the figures say across the holdings. " +
    "If nothing notable, say so plainly.";
  const user = JSON.stringify({
    holdings: xray.holdings.map((h) => ({
      ticker: h.ticker,
      dilutionPct1y: h.dilutionPct1y,
      runwayQuarters: h.runwayQuarters,
      shortPct: h.shortPct,
      insiderNet: h.insiderNet,
    })),
    factNotes: xray.portfolio.notes,
  });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    return typeof text === "string" && text.trim() ? text.trim() : fallback;
  } catch {
    return fallback;
  }
}

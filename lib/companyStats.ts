import { createServiceClient } from "./supabase/server";
import type { TickerAudit } from "./audit";

// ─────────────────────────────────────────────────────────────────────────────
// company_stats data layer — the flat, queryable snapshot the AI screener reads.
// Facts for filtering/research only; never recommendations.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyStatRow {
  ticker: string;
  company_name: string;
  in_universe_reason: string;
  trend_score: number;
  snapshot_at: string;
  price: number | null;
  change_pct_3mo: number | null;
  last_volume: number | null;
  avg_volume_3mo: number | null;
  volume_ratio: number | null;
  market_cap: number | null;
  high_52: number | null;
  low_52: number | null;
  cash: number | null;
  revenue_annual: number | null;
  net_income_annual: number | null;
  shares_outstanding: number | null;
  shares_change_pct_1y: number | null;
  runway_quarters: number | null;
  insider_buys: number;
  insider_sells: number;
  insider_net: number;
  form4_count_180d: number;
  short_pct: number | null;
  filings_12mo: number;
  last_filing_date: string;
  last_form: string;
  trials_total: number;
  contracts_count: number;
  halts_count: number;
  bullish: number;
  bearish: number;
  grade: string;
  score: number;
  industry: string;
  exchange: string;
}

const num = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

// A 1-year share-count change beyond ±300% is almost always a split/reverse-split
// or a share-count parsing artifact, not real dilution. Null it so the screener
// and portfolio x-ray don't surface false "heavy dilution" signals.
const dilution = (v: unknown): number | null => {
  const n = num(v);
  if (n === null) return null;
  return Math.abs(n) > 300 ? null : n;
};

// Flatten a full audit into a stats row for the snapshot table.
export function auditToStatRow(audit: TickerAudit, reason: string, trendScore: number): Record<string, unknown> {
  const lastVol = num(audit.market?.lastVolume);
  const avgVol = num(audit.market?.avgVolume3mo);
  const volumeRatio = lastVol !== null && avgVol && avgVol > 0 ? Number((lastVol / avgVol).toFixed(2)) : null;
  const buys = audit.insiders?.buys ?? 0;
  const sells = audit.insiders?.sells ?? 0;
  return {
    ticker: audit.ticker.toUpperCase(),
    company_name: audit.companyName ?? "",
    in_universe_reason: reason.slice(0, 120),
    trend_score: trendScore,
    snapshot_at: new Date().toISOString(),
    price: num(audit.market?.price),
    change_pct_3mo: num(audit.market?.changePct3mo),
    last_volume: lastVol,
    avg_volume_3mo: avgVol,
    volume_ratio: volumeRatio,
    market_cap: num(audit.market?.marketCap),
    high_52: num(audit.market?.high52),
    low_52: num(audit.market?.low52),
    cash: num(audit.fundamentals?.cash),
    revenue_annual: num(audit.fundamentals?.revenueAnnual),
    net_income_annual: num(audit.fundamentals?.netIncomeAnnual),
    shares_outstanding: num(audit.fundamentals?.sharesOutstanding),
    shares_change_pct_1y: dilution(audit.fundamentals?.sharesChangePct1y),
    runway_quarters: num(audit.fundamentals?.runwayQuarters),
    insider_buys: buys,
    insider_sells: sells,
    insider_net: buys - sells,
    form4_count_180d: audit.insiders?.form4Count180d ?? 0,
    short_pct: num(audit.shortData?.shortPct),
    filings_12mo: audit.filings?.last12mo ?? 0,
    last_filing_date: audit.filings?.lastFilingDate ?? "",
    last_form: audit.filings?.lastForm ?? "",
    trials_total: audit.catalysts?.trials?.total ?? 0,
    contracts_count: audit.catalysts?.contracts?.count ?? 0,
    halts_count: audit.halts?.count ?? 0,
    bullish: audit.social?.bullish ?? 0,
    bearish: audit.social?.bearish ?? 0,
    grade: audit.grade ?? "",
    score: audit.score ?? 0,
    industry: audit.profile?.industry ?? "",
    exchange: audit.profile?.exchange ?? "",
  };
}

// Upsert one snapshot row (service role; called by the nightly cron).
export async function upsertStatRow(row: Record<string, unknown>): Promise<boolean> {
  const svc = createServiceClient();
  const { error } = await svc.from("company_stats").upsert(row, { onConflict: "ticker" });
  if (error) console.error(`[company_stats] upsert ${row.ticker} failed:`, error.message);
  return !error;
}

// ── Screener query ──
// A constrained, structured filter set the AI maps natural language onto. Every
// field is a FACT; there is no "rank by best" — only sort by an explicit metric.
export interface ScreenFilters {
  minVolumeRatio?: number;       // last vol vs 3mo avg — "volume spike"
  maxSharesChangePct1y?: number; // dilution ceiling; 0 = "no dilution (flat/down)"
  minSharesChangePct1y?: number;
  minInsiderNet?: number;        // net open-market buys
  minShortPct?: number;
  maxShortPct?: number;
  minRunwayQuarters?: number;
  minCash?: number;
  minChangePct3mo?: number;
  maxChangePct3mo?: number;
  minMarketCap?: number;
  maxMarketCap?: number;
  hasTrials?: boolean;
  hasContracts?: boolean;
  noHalts?: boolean;
  minBullish?: number;
  sortBy?: "volume_ratio" | "trend_score" | "change_pct_3mo" | "insider_net" | "short_pct" | "snapshot_at";
  limit?: number;
}

export async function screenCompanies(f: ScreenFilters): Promise<CompanyStatRow[]> {
  const svc = createServiceClient();
  let q = svc.from("company_stats").select("*");

  if (f.minVolumeRatio != null) q = q.gte("volume_ratio", f.minVolumeRatio);
  if (f.maxSharesChangePct1y != null) q = q.lte("shares_change_pct_1y", f.maxSharesChangePct1y);
  if (f.minSharesChangePct1y != null) q = q.gte("shares_change_pct_1y", f.minSharesChangePct1y);
  if (f.minInsiderNet != null) q = q.gte("insider_net", f.minInsiderNet);
  if (f.minShortPct != null) q = q.gte("short_pct", f.minShortPct);
  if (f.maxShortPct != null) q = q.lte("short_pct", f.maxShortPct);
  if (f.minRunwayQuarters != null) q = q.gte("runway_quarters", f.minRunwayQuarters);
  if (f.minCash != null) q = q.gte("cash", f.minCash);
  if (f.minChangePct3mo != null) q = q.gte("change_pct_3mo", f.minChangePct3mo);
  if (f.maxChangePct3mo != null) q = q.lte("change_pct_3mo", f.maxChangePct3mo);
  if (f.minMarketCap != null) q = q.gte("market_cap", f.minMarketCap);
  if (f.maxMarketCap != null) q = q.lte("market_cap", f.maxMarketCap);
  if (f.hasTrials) q = q.gt("trials_total", 0);
  if (f.hasContracts) q = q.gt("contracts_count", 0);
  if (f.noHalts) q = q.eq("halts_count", 0);
  if (f.minBullish != null) q = q.gte("bullish", f.minBullish);

  const sortBy = f.sortBy ?? "volume_ratio";
  q = q.order(sortBy, { ascending: false, nullsFirst: false });
  q = q.limit(Math.min(Math.max(f.limit ?? 25, 1), 50));

  const { data, error } = await q;
  if (error) {
    console.error("[company_stats] screen failed:", error.message);
    return [];
  }
  return (data ?? []) as CompanyStatRow[];
}

// Fetch the snapshot rows for a specific set of tickers (e.g. a member's
// watchlist). company_stats only holds the screener UNIVERSE, so a watched
// ticker may simply have no row — callers must tolerate a shorter result set.
export async function getStatRowsForTickers(tickers: string[]): Promise<CompanyStatRow[]> {
  const upper = Array.from(new Set(tickers.map((t) => t.toUpperCase()).filter(Boolean)));
  if (upper.length === 0) return [];
  const svc = createServiceClient();
  const { data, error } = await svc.from("company_stats").select("*").in("ticker", upper);
  if (error) {
    console.error("[company_stats] getStatRowsForTickers failed:", error.message);
    return [];
  }
  return (data ?? []) as CompanyStatRow[];
}

// Every ticker already in the table with its last snapshot time — used by the
// chunked cron to refresh the stalest rows first.
export async function getExistingSnapshotTimes(): Promise<Record<string, string>> {
  const svc = createServiceClient();
  const out: Record<string, string> = {};
  const { data } = await svc.from("company_stats").select("ticker, snapshot_at");
  for (const r of data ?? []) out[String(r.ticker)] = String(r.snapshot_at ?? "");
  return out;
}

// How many companies are in the snapshot + when it was last refreshed.
export async function getUniverseMeta(): Promise<{ count: number; lastSnapshot: string | null }> {
  const svc = createServiceClient();
  const { count } = await svc.from("company_stats").select("ticker", { count: "exact", head: true });
  const { data } = await svc.from("company_stats").select("snapshot_at").order("snapshot_at", { ascending: false }).limit(1);
  return { count: count ?? 0, lastSnapshot: data?.[0]?.snapshot_at ?? null };
}

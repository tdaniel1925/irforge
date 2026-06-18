// Public "Visibility Snapshot" — a shareable, prospect-facing version of the
// Visibility Score, built from live public data only (no signup needed). Used as
// the hook in cold outreach: "here's how investors see $TICKER, free."
//
// Reuses the same audit + scorecard engine the product runs internally, but drops
// the "Your IR Engine" pillar (that measures using PubcoZone, irrelevant to a
// prospect) and re-weights over the remaining external pillars.

import { getPublicTickerAudit } from "./tickerCache";
import { buildScorecard, type Scorecard, type Pillar } from "./score";

export interface Snapshot {
  ticker: string;
  companyName: string;
  score: number;
  grade: Scorecard["grade"];
  generatedAt: string;
  pillars: Pillar[]; // external pillars only, weakest-first
  strengths: { label: string; detail: string }[];
  gaps: { label: string; detail: string }[];
  findings: string[];
  sources: Scorecard["sources"];
}

const ZERO_INTERNAL = { posted30d: 0, pendingDrafts: 0, unansweredQuestions: 0, filingsWithoutDrafts: 0 };

export async function buildSnapshot(rawTicker: string): Promise<Snapshot | null> {
  const ticker = rawTicker.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  if (!ticker) return null;

  const audit = await getPublicTickerAudit(ticker).catch(() => null);
  if (!audit) return null;

  const card = buildScorecard(audit, ZERO_INTERNAL);

  // Keep only external pillars that actually have data; drop the IR-Engine pillar.
  const external = card.pillars.filter((p) => p.key !== "engine" && p.score !== null);

  // Recompute the headline score over external pillars only, so a prospect's grade
  // reflects their public footprint — not a zeroed engine that would tank everyone.
  const totalW = external.reduce((a, p) => a + p.weight, 0);
  const score = totalW > 0 ? Math.round(external.reduce((a, p) => a + (p.score as number) * p.weight, 0) / totalW) : 0;
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";

  const ranked = [...external].sort((a, b) => (a.score as number) - (b.score as number));
  const gaps = ranked.filter((p) => (p.score as number) < 55).slice(0, 3).map((p) => ({ label: p.label, detail: p.detail }));
  const strengths = [...external]
    .sort((a, b) => (b.score as number) - (a.score as number))
    .filter((p) => (p.score as number) >= 60)
    .slice(0, 3)
    .map((p) => ({ label: p.label, detail: p.detail }));

  return {
    ticker,
    companyName: audit.companyName ?? `$${ticker}`,
    score,
    grade,
    generatedAt: card.generatedAt,
    pillars: ranked, // weakest first — the gaps are the sales hook
    strengths,
    gaps,
    findings: card.findings.slice(0, 6),
    sources: card.sources,
  };
}

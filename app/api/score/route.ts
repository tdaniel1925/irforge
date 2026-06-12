import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { runTickerAudit } from "@/lib/audit";
import { buildScorecard, internalStats } from "@/lib/score";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST — refresh the company's Visibility Score from live sources + internal activity.
export async function POST() {
  const { db, save } = await getStore();

  let audit = null;
  try {
    audit = await runTickerAudit(db.company.ticker, db.company.peers);
  } catch {
    audit = null; // external sources down — scorecard degrades to internal pillars
  }

  const scorecard = buildScorecard(audit, internalStats(db));

  db.scoreHistory.push({
    ts: scorecard.generatedAt,
    score: scorecard.score,
    grade: scorecard.grade,
    pillars: scorecard.pillars.map((p) => ({ key: p.key, label: p.label, score: p.score, detail: p.detail })),
  });
  // Keep the last 60 snapshots.
  if (db.scoreHistory.length > 60) db.scoreHistory = db.scoreHistory.slice(-60);

  logAudit(db, "system", "SCORE_REFRESHED", `Visibility Score refreshed: ${scorecard.score}/100 (${scorecard.grade})`);
  await save();

  return NextResponse.json(scorecard);
}

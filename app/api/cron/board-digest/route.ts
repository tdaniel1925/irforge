import { createServiceClient } from "@/lib/supabase/server";
import { boardActivitySince } from "@/lib/board";
import { companyNotifyTarget, sendBoardDigest } from "@/lib/boardNotify";
import { cronAuthorized } from "@/lib/cronAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily board digest (Vercel Cron). For each onboarded company, summarize the last
// 24h of public-board activity (new questions + comments) and email the company a
// digest — but only if there's something new. Best-effort per company so one failure
// doesn't stop the rest.
//
// Auth: CRON_SECRET only (shared cronAuthorized — x-vercel-cron is client-spoofable).

export async function GET(req: Request) {
  if (!cronAuthorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const svc = createServiceClient();
  const { data: companies } = await svc
    .from("companies")
    .select("ticker")
    .eq("onboarding_complete", true);

  // 24h window (matches the daily cadence). Passed as a fixed ISO so the cron is
  // deterministic within its run.
  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  let checked = 0;
  let sent = 0;
  for (const row of companies ?? []) {
    const ticker = String(row.ticker ?? "").trim();
    if (!ticker) continue;
    checked++;
    try {
      const activity = await boardActivitySince(ticker, sinceIso);
      if (activity.newQuestions.length === 0 && activity.newComments === 0) continue;
      const target = await companyNotifyTarget(ticker);
      if (!target) continue;
      const ok = await sendBoardDigest(target, {
        newQuestions: activity.newQuestions.length,
        newComments: activity.newComments,
        unansweredTotal: activity.unansweredTotal,
      });
      if (ok) sent++;
    } catch {
      /* best-effort per company */
    }
  }

  return Response.json({ ok: true, checked, digestsSent: sent });
}

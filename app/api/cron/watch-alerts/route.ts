import { runTickerAudit } from "@/lib/audit";
import {
  getWatchedTickers,
  getWatchersFor,
  getWatchSnapshot,
  setWatchSnapshot,
  type WatchSnapshot,
} from "@/lib/publicStats";
import { sendWatchAlert } from "@/lib/email";
import { explainFiling } from "@/lib/filingExplain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // up to 5 min — many tickers, sequential audits

// Scheduled alert dispatcher (Vercel Cron). For each watched ticker it runs a
// fresh audit, diffs against the last-seen snapshot, and emails subscribers about
// genuinely new events (filing / insider trade / halt / grade change). Then it
// stores the new snapshot so each event is sent exactly once.
//
// Auth: requires the Vercel-Cron header OR ?secret=CRON_SECRET (manual trigger).
function authorized(req: Request): boolean {
  // Vercel sets this header on cron invocations.
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never allow unauthenticated runs in prod
  const url = new URL(req.url);
  const provided = url.searchParams.get("secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return provided === secret;
}

interface Change {
  headline: string;
  detail: string;
}

function diff(prev: WatchSnapshot | null, cur: WatchSnapshot): Change[] {
  const changes: Change[] = [];

  // New SEC filing.
  if (cur.lastFilingDate && cur.lastFilingDate !== prev?.lastFilingDate) {
    changes.push({
      headline: `New SEC filing — ${cur.lastForm ?? "filing"}`,
      detail: `A new ${cur.lastForm ?? "document"} was filed on ${cur.lastFilingDate}. It's on the official record now.`,
    });
  }

  // Insider activity (only when counts increase).
  if (prev) {
    const newBuys = (cur.insiderBuys ?? 0) - (prev.insiderBuys ?? 0);
    const newSells = (cur.insiderSells ?? 0) - (prev.insiderSells ?? 0);
    if (newBuys > 0) {
      changes.push({
        headline: `Insider buying detected`,
        detail: `${newBuys} new open-market insider buy${newBuys > 1 ? "s" : ""} (Form 4) since the last check.`,
      });
    }
    if (newSells > 0) {
      changes.push({
        headline: `Insider selling detected`,
        detail: `${newSells} new open-market insider sell${newSells > 1 ? "s" : ""} (Form 4) since the last check.`,
      });
    }
  }

  // New trade halt.
  if ((cur.haltCount ?? 0) > (prev?.haltCount ?? 0)) {
    changes.push({
      headline: `Trading halt`,
      detail: `Trading was halted — usually a sign of unusual volatility or pending news. Check the report.`,
    });
  }

  // Visibility grade change.
  if (prev?.grade && cur.grade && prev.grade !== cur.grade) {
    const better = cur.grade < prev.grade; // "A" < "B" alphabetically = improvement
    changes.push({
      headline: `Visibility grade ${better ? "improved" : "changed"}: ${prev.grade} → ${cur.grade}`,
      detail: `The PubcoZone Visibility Grade moved from ${prev.grade} to ${cur.grade}.`,
    });
  }

  return changes;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const tickers = await getWatchedTickers();
  const summary: { ticker: string; changes: number; recipients: number; error?: string }[] = [];
  let emailsSent = 0;

  for (const ticker of tickers) {
    try {
      const audit = await runTickerAudit(ticker, []);
      const cur: WatchSnapshot = {
        lastFilingDate: audit.filings.lastFilingDate,
        lastForm: audit.filings.lastForm,
        insiderBuys: audit.insiders?.buys,
        insiderSells: audit.insiders?.sells,
        haltCount: audit.halts?.count ?? 0,
        grade: audit.grade,
      };
      const prev = await getWatchSnapshot(ticker);
      const changes = prev === null ? [] : diff(prev, cur); // first run: seed only, no alert spam

      let recipients = 0;
      if (changes.length > 0) {
        // Enrich a new-filing alert with a plain-English explanation of what the
        // filing TYPE means (facts only — never interprets the contents). Best-effort.
        if (cur.lastForm && cur.lastFilingDate && cur.lastFilingDate !== prev?.lastFilingDate) {
          const filingChange = changes.find((c) => c.headline.startsWith("New SEC filing"));
          if (filingChange) {
            try {
              const exp = await explainFiling(cur.lastForm, audit.companyName ?? ticker, cur.lastFilingDate);
              filingChange.detail += ` ${exp.plain} ${exp.watchFor}`;
            } catch { /* keep the base detail */ }
          }
        }
        const watchers = await getWatchersFor(ticker);
        recipients = watchers.length;
        for (const ch of changes) {
          for (const email of watchers) {
            try {
              await sendWatchAlert(email, ticker, ch.headline, ch.detail);
              emailsSent++;
            } catch (e) {
              console.error(`[cron] alert send failed ${ticker} -> ${email}:`, e);
            }
          }
        }
      }

      await setWatchSnapshot(ticker, cur);
      summary.push({ ticker, changes: changes.length, recipients });
    } catch (e) {
      console.error(`[cron] ticker ${ticker} failed:`, e);
      summary.push({ ticker, changes: 0, recipients: 0, error: "audit failed" });
    }
  }

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    tickersChecked: tickers.length,
    emailsSent,
    summary,
  });
}

import type { Database } from "./types";
import { getBoardPosts } from "./publicStats";
import { runTickerAudit, type TickerAudit } from "./audit";

// The Threat Radar — detects negative narratives a company would otherwise miss,
// from data PubcoZone already pulls. Each threat carries a severity and is wired so the
// company can draft a filing-cited rebuttal and get alerted.

export type ThreatSeverity = "high" | "medium" | "low";

export interface Threat {
  id: string;
  source: string; // "Board" | "StockTwits" | "News" | "Short data" | "Trade halt"
  severity: ThreatSeverity;
  title: string;
  detail: string;
  evidence?: string; // the actual hostile text / data point
  ts: string;
}

export interface ThreatReport {
  generatedAt: string;
  threats: Threat[];
  sentimentDelta?: number; // negative = sentiment getting worse
}

function sev(rank: number): ThreatSeverity {
  return rank >= 3 ? "high" : rank >= 2 ? "medium" : "low";
}

export async function scanThreats(db: Database, audit?: TickerAudit | null): Promise<ThreatReport> {
  const ticker = db.company.ticker.toUpperCase();
  const threats: Threat[] = [];
  let n = 0;

  // Use a passed audit, or fetch one (so the radar works standalone).
  let a = audit;
  if (a === undefined) {
    try {
      a = await runTickerAudit(ticker, db.company.peers);
    } catch {
      a = null;
    }
  }

  // 1 — FUD on the company's own board (the iHub-basher problem, caught on home turf).
  // Only surface RECENT board FUD — the radar is a live monitor, not a replay of old
  // posts. Without this, stale/seeded posts show as "active threats" forever (a 2-week-
  // old post kept surfacing on companies with quiet boards). 14-day window.
  const FUD_WINDOW_DAYS = 14;
  const freshCutoff = Date.now() - FUD_WINDOW_DAYS * 86400000;
  const board = await getBoardPosts(ticker, 100);
  const fud = board.filter(
    (p) => p.flag === "fud" && !p.verified && new Date(p.ts).getTime() >= freshCutoff
  );
  for (const p of fud.slice(0, 5)) {
    threats.push({
      id: `thr_${ticker}_${n++}`,
      source: "Board",
      severity: "medium",
      title: `Baseless attack from ${p.author}`,
      detail: "The AI flagged this board post as unverified FUD. A verified, filing-cited rebuttal carries more weight than letting it stand.",
      evidence: p.body,
      ts: p.ts,
    });
  }

  // 2 — Bearish StockTwits sentiment skew.
  if (a) {
    const rated = a.social.bullish + a.social.bearish;
    if (rated >= 5 && a.social.bearish / rated > 0.5) {
      const pct = Math.round((a.social.bearish / rated) * 100);
      threats.push({
        id: `thr_${ticker}_${n++}`,
        source: "StockTwits",
        severity: sev(pct >= 70 ? 3 : 2),
        title: `Sentiment skewing bearish (${pct}% of rated messages)`,
        detail: "The conversation is being led by skeptics. Posting a factual update or answering open questions reclaims the narrative.",
        ts: new Date().toISOString(),
      });
    }

    // 3 — Negative news in the press.
    if (a.sources.find((s) => s.name === "News (GDELT)")?.ok && a.news.articles30d >= 8) {
      threats.push({
        id: `thr_${ticker}_${n++}`,
        source: "News",
        severity: "low",
        title: `${a.news.articles30d} news articles in 30 days — monitor framing`,
        detail: `Heavy coverage cuts both ways. Outlets: ${a.news.topOutlets.slice(0, 3).join(", ")}. Make sure your version of the story is also out there.`,
        ts: new Date().toISOString(),
      });
    }

    // 4 — Short pressure.
    if (a.shortData && a.shortData.shortPct >= 60) {
      threats.push({
        id: `thr_${ticker}_${n++}`,
        source: "Short data",
        severity: sev(a.shortData.shortPct >= 70 ? 3 : 2),
        title: `Elevated short volume (${Math.round(a.shortData.shortPct)}% of daily volume)`,
        detail: "The bear side is leaning on the tape. This often pairs with a coordinated negative narrative — watch the board and news closely.",
        ts: new Date().toISOString(),
      });
    }

    // 5 — Trade halt (acute).
    if (a.halts && a.halts.count > 0) {
      threats.push({
        id: `thr_${ticker}_${n++}`,
        source: "Trade halt",
        severity: "high",
        title: `Recent trade halt detected`,
        detail: `Halts create an information vacuum that rumors fill. A prompt, factual statement is the standard playbook. Halt(s): ${a.halts.recent.map((h) => h.date).join(", ")}.`,
        ts: new Date().toISOString(),
      });
    }
  }

  // Sort by severity then recency.
  const rank = { high: 3, medium: 2, low: 1 };
  threats.sort((x, y) => rank[y.severity] - rank[x.severity] || y.ts.localeCompare(x.ts));

  return { generatedAt: new Date().toISOString(), threats };
}

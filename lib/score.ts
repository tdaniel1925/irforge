import type { TickerAudit } from "./audit";
import type { Database } from "./types";

// The Visibility Score — the number the whole product is organized around.
// External pillars come from the live audit; the Engine pillar comes from
// work done inside PubcoZone, so using the app visibly moves the score.

export interface Pillar {
  key: string;
  label: string;
  score: number | null; // null = no data (weight redistributed)
  weight: number;
  detail: string;
  action: { label: string; href: string };
}

export interface Scorecard {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  generatedAt: string;
  pillars: Pillar[];
  findings: string[];
  sources: TickerAudit["sources"];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function toGrade(score: number): Scorecard["grade"] {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
}

export interface InternalStats {
  posted30d: number;
  pendingDrafts: number;
  unansweredQuestions: number;
  filingsWithoutDrafts: number;
}

export function internalStats(db: Database): InternalStats {
  const cutoff = Date.now() - 30 * 86400000;
  return {
    posted30d: db.drafts.filter((d) => d.status === "posted" && d.postedAt && new Date(d.postedAt).getTime() >= cutoff).length,
    pendingDrafts: db.drafts.filter((d) => d.status === "pending").length,
    unansweredQuestions: db.mentions.filter((m) => m.sentiment === "question" && !m.replyDraftId).length,
    filingsWithoutDrafts: db.filings.filter((f) => !f.draftId).length,
  };
}

export function buildScorecard(audit: TickerAudit | null, internal: InternalStats): Scorecard {
  const pillars: Pillar[] = [];

  // --- Visibility: watchers vs peers ---
  {
    let score: number | null = null;
    let detail = "No StockTwits data available.";
    if (audit && typeof audit.social.watchers === "number") {
      const peerWatchers = audit.peers.map((p) => p.watchers).filter((n): n is number => typeof n === "number");
      if (peerWatchers.length > 0) {
        const med = peerWatchers.sort((a, b) => a - b)[Math.floor(peerWatchers.length / 2)];
        const ratio = med > 0 ? audit.social.watchers / med : 1;
        score = clamp(ratio * 60);
        detail = `${audit.social.watchers.toLocaleString()} watchers vs. peer median ${med.toLocaleString()}.`;
      } else {
        score = clamp(Math.log10(Math.max(1, audit.social.watchers)) * 22);
        detail = `${audit.social.watchers.toLocaleString()} StockTwits watchers (add peers in Settings for comparison).`;
      }
    }
    pillars.push({ key: "visibility", label: "Investor Visibility", score, weight: 0.18, detail, action: { label: "Run a full audit", href: "/ticker-audit" } });
  }

  // --- Conversation: message volume & recency ---
  {
    let score: number | null = null;
    let detail = "No conversation data available.";
    if (audit && typeof audit.social.msgsPerDay === "number") {
      score = clamp((audit.social.msgsPerDay / 5) * 100);
      if (typeof audit.social.lastMessageAgeDays === "number" && audit.social.lastMessageAgeDays > 7) score = clamp(score - 25);
      detail = `~${audit.social.msgsPerDay.toFixed(1)} messages/day about your ticker.`;
    }
    pillars.push({ key: "conversation", label: "Conversation Volume", score, weight: 0.14, detail, action: { label: "Publish a post", href: "/approvals" } });
  }

  // --- Sentiment ---
  {
    let score: number | null = null;
    let detail = "Not enough rated messages.";
    if (audit) {
      const rated = audit.social.bullish + audit.social.bearish;
      if (rated >= 3) {
        score = clamp((audit.social.bullish / rated) * 100);
        detail = `${Math.round((audit.social.bullish / rated) * 100)}% of rated messages are bullish.`;
      }
    }
    pillars.push({ key: "sentiment", label: "Sentiment", score, weight: 0.1, detail, action: { label: "Answer the skeptics", href: "/mentions" } });
  }

  // --- Media coverage (GDELT) ---
  {
    let score: number | null = null;
    let detail = "News index unavailable.";
    if (audit && audit.sources.find((s) => s.name === "News (GDELT)")?.ok) {
      score = clamp((audit.news.articles30d / 12) * 100);
      detail = audit.news.articles30d > 0
        ? `${audit.news.articles30d} news articles in the last 30 days (${audit.news.topOutlets.slice(0, 2).join(", ")}).`
        : "No news coverage found in the last 30 days.";
    }
    pillars.push({ key: "media", label: "Media Coverage", score, weight: 0.13, detail, action: { label: "Turn a filing into news", href: "/filings" } });
  }

  // --- Market pulse (Yahoo) ---
  {
    let score: number | null = null;
    let detail = "Market data unavailable.";
    if (audit && typeof audit.market.avgVolume3mo === "number" && typeof audit.market.lastVolume === "number" && audit.market.avgVolume3mo > 0) {
      const ratio = audit.market.lastVolume / audit.market.avgVolume3mo;
      score = clamp(ratio * 55);
      detail = `Volume at ${(ratio * 100).toFixed(0)}% of the 3-month average${typeof audit.market.changePct3mo === "number" ? `; price ${audit.market.changePct3mo >= 0 ? "+" : ""}${audit.market.changePct3mo.toFixed(1)}% over 3 months` : ""}.`;
    }
    pillars.push({ key: "market", label: "Liquidity Pulse", score, weight: 0.1, detail, action: { label: "See the full picture", href: "/ticker-audit" } });
  }

  // --- Disclosure freshness (EDGAR) ---
  {
    let score: number | null = null;
    let detail = "EDGAR data unavailable.";
    if (audit && audit.filings.lastFilingDate) {
      const age = (Date.now() - new Date(audit.filings.lastFilingDate).getTime()) / 86400000;
      score = clamp(100 - age * 1.5);
      detail = `Latest filing (${audit.filings.lastForm}) was ${Math.round(age)} days ago; ${audit.filings.last12mo} filings in 12 months.`;
    }
    pillars.push({ key: "disclosure", label: "News Flow", score, weight: 0.1, detail, action: { label: "Check filings", href: "/filings" } });
  }

  // --- Fundamentals (XBRL) ---
  {
    let score: number | null = null;
    let detail = "No structured financials on EDGAR.";
    if (audit?.fundamentals?.cash !== undefined) {
      const f = audit.fundamentals;
      if (typeof f.runwayQuarters === "number") {
        score = clamp((f.runwayQuarters / 8) * 100); // 8+ quarters of runway = full marks
        detail = `~${f.runwayQuarters.toFixed(1)} quarters of cash runway at the current loss rate.`;
      } else if (typeof f.netIncomeAnnual === "number" && f.netIncomeAnnual >= 0) {
        score = 90;
        detail = "Profitable on an annual basis — runway isn't the question.";
      } else {
        score = 50;
        detail = `Cash on hand as of ${f.cashAsOf}; loss rate unavailable.`;
      }
      if (typeof f.sharesChangePct1y === "number" && f.sharesChangePct1y > 25) {
        score = clamp(score - 20);
        detail += ` Share count +${f.sharesChangePct1y.toFixed(0)}% in 1 year (dilution).`;
      }
    }
    pillars.push({ key: "fundamentals", label: "Fundamentals", score, weight: 0.12, detail, action: { label: "See the filings", href: "/filings" } });
  }

  // --- Insider conviction (Form 4) ---
  {
    let score: number | null = null;
    let detail = "No recent insider filings found.";
    if (audit?.insiders) {
      const ins = audit.insiders;
      if (ins.buys + ins.sells > 0) {
        score = clamp((ins.buys / (ins.buys + ins.sells)) * 100);
        detail = `${ins.buys} open-market buy vs ${ins.sells} sell transactions in recent Form 4s.`;
      } else if (ins.form4Count180d > 0) {
        score = 50;
        detail = `${ins.form4Count180d} Form 4s in 180 days (grants/other — no open-market buys or sells parsed).`;
      } else {
        score = 40;
        detail = "No Form 4 activity in 180 days — insider silence reads as indifference.";
      }
    }
    pillars.push({ key: "insiders", label: "Insider Conviction", score, weight: 0.08, detail, action: { label: "See the filings", href: "/filings" } });
  }

  // --- Discoverability (Wikipedia) ---
  {
    let score: number | null = null;
    let detail = "No Wikipedia page found — most micro-caps don't have one.";
    if (audit?.wiki) {
      const w = audit.wiki;
      score = clamp(Math.log10(Math.max(1, w.views30d)) * 25);
      const trend = w.viewsPrev30d > 0 ? ((w.views30d - w.viewsPrev30d) / w.viewsPrev30d) * 100 : 0;
      detail = `${w.views30d.toLocaleString()} Wikipedia views in 30 days (${trend >= 0 ? "+" : ""}${trend.toFixed(0)}% vs prior month).`;
    }
    pillars.push({ key: "discoverability", label: "Discoverability", score, weight: 0.05, detail, action: { label: "Publish more", href: "/approvals" } });
  }

  // --- Short pressure (FINRA daily short volume) ---
  {
    let score: number | null = null;
    let detail = "FINRA data unavailable for this symbol.";
    if (audit?.shortData) {
      // ~30-50% is normal market-making range; score degrades above it.
      score = clamp(100 - Math.max(0, audit.shortData.shortPct - 35) * 2.5);
      detail = `${audit.shortData.shortPct.toFixed(0)}% of daily volume sold short (FINRA, ${audit.shortData.date.slice(4, 6)}/${audit.shortData.date.slice(6, 8)}). Note: daily short volume includes market-making — not the same as short interest.`;
    }
    pillars.push({ key: "shortpressure", label: "Short Pressure", score, weight: 0.07, detail, action: { label: "Watch the tape", href: "/ticker-audit" } });
  }

  // --- Untapped channels (Reddit) ---
  {
    let score: number | null = null;
    let detail = "Reddit unreachable right now.";
    if (audit && audit.sources.find((s) => s.name === "Reddit")?.ok) {
      score = clamp((audit.reddit.postsFound / 10) * 100);
      detail = audit.reddit.postsFound > 0
        ? `${audit.reddit.postsFound} Reddit posts in the past year (${audit.reddit.topSubreddits.slice(0, 2).join(", ")}).`
        : "Zero Reddit footprint — an untouched channel.";
    }
    pillars.push({ key: "reddit", label: "Community Reach", score, weight: 0.05, detail, action: { label: "Audit the channels", href: "/ticker-audit" } });
  }

  // --- IR Engine: work done inside PubcoZone ---
  {
    const postingScore = clamp((internal.posted30d / 12) * 100);
    const responsiveness = internal.unansweredQuestions === 0 ? 100 : internal.unansweredQuestions <= 2 ? 50 : 0;
    const score = clamp(postingScore * 0.7 + responsiveness * 0.3);
    const bits: string[] = [`${internal.posted30d} posts published in 30 days (target: 12)`];
    if (internal.unansweredQuestions > 0) bits.push(`${internal.unansweredQuestions} shareholder question${internal.unansweredQuestions > 1 ? "s" : ""} unanswered`);
    if (internal.pendingDrafts > 0) bits.push(`${internal.pendingDrafts} draft${internal.pendingDrafts > 1 ? "s" : ""} waiting for approval`);
    pillars.push({
      key: "engine",
      label: "Your IR Engine",
      score,
      weight: 0.2,
      detail: bits.join(" · ") + ".",
      action: internal.pendingDrafts > 0 ? { label: "Approve drafts now", href: "/approvals" } : { label: "Create a post", href: "/filings" },
    });
  }

  // Composite: weighted average over pillars that have data.
  const live = pillars.filter((p) => p.score !== null);
  const totalWeight = live.reduce((a, p) => a + p.weight, 0);
  const composite = totalWeight > 0 ? clamp(live.reduce((a, p) => a + (p.score as number) * p.weight, 0) / totalWeight) : 0;

  const findings = audit?.findings ? [...audit.findings] : [];
  const externalLive = live.filter((p) => p.key !== "engine");
  if (externalLive.length === 0) {
    findings.unshift(
      `External sources couldn't verify $${audit?.ticker ?? "your ticker"} — the score currently reflects only work done inside PubcoZone. If this is the demo company, its ticker is fictional: set your real ticker and peers in Settings, then refresh.`
    );
  }

  return {
    score: composite,
    grade: toGrade(composite),
    generatedAt: new Date().toISOString(),
    pillars,
    findings,
    sources: audit?.sources ?? [],
  };
}

import type { CompanyStatRow } from "./companyStats";

// Multi-factor sentiment SNAPSHOT — strictly descriptive.
//
// COMPLIANCE: this describes the CURRENT, MEASURED state of public signals
// (board label mix, StockTwits sentiment, volume vs average, short %, company
// responsiveness). It never predicts anything, never scores the stock, and never
// suggests an action. Deterministic mood buckets + an optional Haiku caption with
// the same guardrails as the manipulation radar.

export interface Mix7d {
  factual: number;
  opinion: number;
  hype: number;
  fud: number;
  chatter: number;
  question: number;
  verified: number;
  total: number;
}

export interface SentimentComposite {
  mood: "quiet" | "constructive" | "curious" | "heated" | "cautious";
  moodLabel: string;         // human words for the mood bucket
  factors: string[];         // the measured facts that produced it (shown to readers)
  answeredRate: number | null; // 0..1 of questions answered (null = no questions)
}

export function computeSentimentComposite(input: {
  mix: Mix7d;
  stat?: Pick<CompanyStatRow, "volume_ratio" | "bullish" | "bearish" | "short_pct"> | null;
  openQuestions: number;
  answeredQuestions: number;
}): SentimentComposite {
  const { mix, stat } = input;
  const factors: string[] = [];

  // Board character (last 7 days of AI labels).
  const signalPosts = mix.factual + mix.opinion;
  const noisePosts = mix.hype + mix.fud;

  const totalQ = input.openQuestions + input.answeredQuestions;
  const answeredRate = totalQ > 0 ? input.answeredQuestions / totalQ : null;

  if (mix.total > 0) {
    if (signalPosts > 0) factors.push(`${signalPosts} substantive post${signalPosts === 1 ? "" : "s"} (factual/reasoned) this week`);
    if (noisePosts > 0) factors.push(`${noisePosts} hype/fear post${noisePosts === 1 ? "" : "s"} this week`);
    if (mix.question > 0) factors.push(`${mix.question} investor question${mix.question === 1 ? "" : "s"}`);
  }
  if (answeredRate !== null) {
    factors.push(`company has answered ${Math.round(answeredRate * 100)}% of questions`);
  }

  // Market context (public numbers, described plainly).
  const vol = typeof stat?.volume_ratio === "number" && isFinite(stat.volume_ratio) ? stat.volume_ratio : null;
  if (vol !== null && vol >= 2) factors.push(`volume ${vol.toFixed(1)}x its 3-month average`);
  const bullish = stat?.bullish ?? 0;
  const bearish = stat?.bearish ?? 0;
  if (bullish + bearish >= 10) {
    const pct = Math.round((bullish / (bullish + bearish)) * 100);
    factors.push(`StockTwits messages ${pct}% bullish-tagged`);
  }

  // Deterministic mood bucket — measured, never predictive.
  let mood: SentimentComposite["mood"];
  if (mix.total < 3) mood = "quiet";
  else if (noisePosts > signalPosts + mix.question) mood = "heated";
  else if (mix.fud >= 2 && mix.fud >= mix.factual) mood = "cautious";
  else if (mix.question >= Math.max(2, mix.total / 3)) mood = "curious";
  else mood = "constructive";

  const moodLabel = {
    quiet: "Quiet — little recent discussion",
    constructive: "Constructive — substance outweighs noise",
    curious: "Curious — investors are asking questions",
    heated: "Heated — promotion/fear outpacing substance",
    cautious: "Cautious — unsupported bearish claims circulating",
  }[mood];

  return { mood, moodLabel, factors, answeredRate };
}

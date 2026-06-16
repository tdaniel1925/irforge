import type { CompanyStatRow } from "./companyStats";

// Manipulation radar — PURE, deterministic signal computation.
//
// COMPLIANCE: This describes PUBLIC posting patterns and PUBLIC volume facts.
// It is investor-facing CAUTION, never advice. It never says a stock is being
// "pumped", never tells anyone to buy or sell, names no users, and attributes
// nothing to the company. It only points out that hype-flagged posts have
// clustered and/or that traded volume is unusual versus its own 3-month average,
// so readers verify claims against filings before acting.

const HYPE_FLAGS = new Set(["hype"]);

// Window we treat as "recent" for clustering (last 24h).
const RECENT_MS = 24 * 60 * 60 * 1000;
// Tight burst window: many hype posts inside this many minutes reads as coordinated.
const BURST_WINDOW_MIN = 90;
// Volume that's this many times the 3-month average is "elevated".
const VOLUME_ELEVATED = 2.5;

type RadarPost = { author: string; flag: string; ts: string; memberId?: string };

export interface ManipulationSignals {
  level: "none" | "watch" | "elevated";
  signals: string[];
  counts: {
    hypePosts24h: number;
    distinctAuthors24h: number;
    burstWindowMin: number;
    volumeRatio: number | null;
  };
}

export function computeManipulationSignals(input: {
  posts: RadarPost[];
  stat?: Pick<CompanyStatRow, "volume_ratio" | "bullish" | "bearish" | "short_pct">;
}): ManipulationSignals {
  const now = Date.now();
  const signals: string[] = [];

  // Recent hype-flagged posts only.
  const recentHype = (input.posts ?? [])
    .filter((p) => p && HYPE_FLAGS.has((p.flag || "").toLowerCase()))
    .map((p) => ({ ...p, t: new Date(p.ts).getTime() }))
    .filter((p) => isFinite(p.t) && now - p.t <= RECENT_MS)
    .sort((a, b) => a.t - b.t);

  const hypePosts24h = recentHype.length;
  const distinctAuthors24h = new Set(
    recentHype.map((p) => p.memberId || p.author || "")
  ).size;

  // Tightest cluster: largest count of hype posts within any BURST_WINDOW_MIN window.
  let burstCount = 0;
  const burstMs = BURST_WINDOW_MIN * 60 * 1000;
  for (let i = 0; i < recentHype.length; i++) {
    let c = 1;
    for (let j = i + 1; j < recentHype.length; j++) {
      if (recentHype[j].t - recentHype[i].t <= burstMs) c++;
      else break;
    }
    if (c > burstCount) burstCount = c;
  }

  // Distinct authors inside the densest burst (proxy for "multiple/new accounts").
  let burstAuthors = 0;
  for (let i = 0; i < recentHype.length; i++) {
    const a = new Set<string>();
    for (let j = i; j < recentHype.length; j++) {
      if (recentHype[j].t - recentHype[i].t <= burstMs) a.add(recentHype[j].memberId || recentHype[j].author || "");
      else break;
    }
    if (a.size > burstAuthors) burstAuthors = a.size;
  }

  const volumeRatio =
    typeof input.stat?.volume_ratio === "number" && isFinite(input.stat.volume_ratio)
      ? input.stat.volume_ratio
      : null;

  // ---- deterministic scoring ----
  const clustered = burstCount >= 3 && burstAuthors >= 2; // multiple accounts, short window
  const heavyHype = hypePosts24h >= 5;
  const volumeElevated = volumeRatio !== null && volumeRatio >= VOLUME_ELEVATED;

  if (clustered) {
    signals.push(
      `${burstCount} hype-flagged posts from ${burstAuthors} accounts clustered within ${BURST_WINDOW_MIN} minutes`
    );
  } else if (heavyHype) {
    signals.push(`${hypePosts24h} hype-flagged posts on this board in the last 24h`);
  }

  if (volumeElevated) {
    signals.push(`Traded volume is ${volumeRatio!.toFixed(1)}x its 3-month average`);
  }

  // Level: elevated when posting pattern AND volume both fire, or a strong cluster
  // on its own; watch for a single softer signal; none otherwise.
  let level: ManipulationSignals["level"] = "none";
  if ((clustered && volumeElevated) || (clustered && burstCount >= 5)) {
    level = "elevated";
  } else if (clustered || heavyHype || volumeElevated) {
    level = "watch";
  }

  return {
    level,
    signals,
    counts: { hypePosts24h, distinctAuthors24h, burstWindowMin: BURST_WINDOW_MIN, volumeRatio },
  };
}

// Optional one-line caption. Haiku if a key is present, deterministic template otherwise.
// The template fallback is MANDATORY and always neutral / non-advice.
export async function describeManipulationRisk(
  signals: ManipulationSignals
): Promise<{ caption: string; engine: "claude" | "template" }> {
  const template =
    signals.level === "none"
      ? "No unusual promotion pattern detected on this board right now."
      : "Several hype-flagged posts clustered in a short window — verify claims against the company's SEC filings before acting.";

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || signals.level === "none") return { caption: template, engine: "template" };

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
        max_tokens: 80,
        system:
          "You write a single neutral caution sentence for investors on a message board. " +
          "STRICT: describe ONLY the posting pattern and public volume facts given. " +
          "NEVER give advice, NEVER say buy/sell/pump/dump, NEVER name users or blame the company, " +
          "NEVER predict price. End by telling readers to verify claims against SEC filings. " +
          "Return ONE plain sentence, no quotes.",
        messages: [
          {
            role: "user",
            content: `Signals: ${signals.signals.join("; ") || "none"}. Write the caution sentence.`,
          },
        ],
      }),
    });
    if (!res.ok) return { caption: template, engine: "template" };
    const data = await res.json();
    const text: string | undefined = data?.content?.[0]?.text?.trim();
    if (!text) return { caption: template, engine: "template" };
    // Guard: if the model drifts into advice-y / price-prediction language, fall back
    // to the safe template. Last line of defense behind the system prompt + token cap.
    if (/\b(buy|sell|pump|dump|short it|go long|undervalued|overvalued|target price|accumulate|load up|trim|exit|rug|moon|multibagger)\b|\$\s?\d/i.test(text)) {
      return { caption: template, engine: "template" };
    }
    return { caption: text, engine: "claude" };
  } catch {
    return { caption: template, engine: "template" };
  }
}

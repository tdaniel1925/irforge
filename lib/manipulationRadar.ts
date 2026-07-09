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
// Coordinated FEAR campaigns (bear raids) are the mirror image of hype pumps —
// the AI already labels baseless fear-mongering as "fud", so cluster those too.
const FUD_FLAGS = new Set(["fud"]);

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
    fudPosts24h: number;
    distinctAuthors24h: number;
    burstWindowMin: number;
    volumeRatio: number | null;
  };
}

// Densest burst of posts within the burst window: max post count and max distinct
// authors across all window placements. Shared by the hype and fud passes.
function densestBurst(posts: Array<{ t: number; memberId?: string; author: string }>): { count: number; authors: number } {
  const burstMs = BURST_WINDOW_MIN * 60 * 1000;
  let count = 0;
  let authors = 0;
  for (let i = 0; i < posts.length; i++) {
    let c = 1;
    const a = new Set<string>([posts[i].memberId || posts[i].author || ""]);
    for (let j = i + 1; j < posts.length; j++) {
      if (posts[j].t - posts[i].t <= burstMs) {
        c++;
        a.add(posts[j].memberId || posts[j].author || "");
      } else break;
    }
    if (c > count) count = c;
    if (a.size > authors) authors = a.size;
  }
  return { count, authors };
}

export function computeManipulationSignals(input: {
  posts: RadarPost[];
  stat?: Pick<CompanyStatRow, "volume_ratio" | "bullish" | "bearish" | "short_pct">;
}): ManipulationSignals {
  const now = Date.now();
  const signals: string[] = [];

  const recentBy = (flags: Set<string>) =>
    (input.posts ?? [])
      .filter((p) => p && flags.has((p.flag || "").toLowerCase()))
      .map((p) => ({ ...p, t: new Date(p.ts).getTime() }))
      .filter((p) => isFinite(p.t) && now - p.t <= RECENT_MS)
      .sort((a, b) => a.t - b.t);

  const recentHype = recentBy(HYPE_FLAGS);
  const recentFud = recentBy(FUD_FLAGS);

  const hypePosts24h = recentHype.length;
  const fudPosts24h = recentFud.length;
  const distinctAuthors24h = new Set(
    [...recentHype, ...recentFud].map((p) => p.memberId || p.author || "")
  ).size;

  const hypeBurst = densestBurst(recentHype);
  const fudBurst = densestBurst(recentFud);

  const volumeRatio =
    typeof input.stat?.volume_ratio === "number" && isFinite(input.stat.volume_ratio)
      ? input.stat.volume_ratio
      : null;

  // ---- deterministic scoring ----
  const hypeClustered = hypeBurst.count >= 3 && hypeBurst.authors >= 2; // multiple accounts, short window
  const fudClustered = fudBurst.count >= 3 && fudBurst.authors >= 2;    // coordinated fear campaign
  const clustered = hypeClustered || fudClustered;
  const heavyHype = hypePosts24h >= 5;
  const heavyFud = fudPosts24h >= 5;
  const volumeElevated = volumeRatio !== null && volumeRatio >= VOLUME_ELEVATED;

  if (hypeClustered) {
    signals.push(
      `${hypeBurst.count} hype-flagged posts from ${hypeBurst.authors} accounts clustered within ${BURST_WINDOW_MIN} minutes`
    );
  } else if (heavyHype) {
    signals.push(`${hypePosts24h} hype-flagged posts on this board in the last 24h`);
  }
  if (fudClustered) {
    signals.push(
      `${fudBurst.count} fear-flagged posts (baseless bearish claims) from ${fudBurst.authors} accounts clustered within ${BURST_WINDOW_MIN} minutes`
    );
  } else if (heavyFud) {
    signals.push(`${fudPosts24h} fear-flagged posts on this board in the last 24h`);
  }

  if (volumeElevated) {
    signals.push(`Traded volume is ${volumeRatio!.toFixed(1)}x its 3-month average`);
  }

  // Level: elevated when posting pattern AND volume both fire, or a strong cluster
  // on its own; watch for a single softer signal; none otherwise.
  const strongCluster = hypeBurst.count >= 5 || fudBurst.count >= 5;
  let level: ManipulationSignals["level"] = "none";
  if ((clustered && volumeElevated) || (clustered && strongCluster)) {
    level = "elevated";
  } else if (clustered || heavyHype || heavyFud || volumeElevated) {
    level = "watch";
  }

  return {
    level,
    signals,
    counts: { hypePosts24h, fudPosts24h, distinctAuthors24h, burstWindowMin: BURST_WINDOW_MIN, volumeRatio },
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

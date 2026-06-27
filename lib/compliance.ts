import type { Company, ComplianceFlag } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// FAST FIRST-PASS LANGUAGE FLAGGER.
//
// This is an assistive keyword scan that flags obviously risky phrasing for the
// company's review — it is NOT a compliance certification and it CANNOT detect
// everything (a determined writer can paraphrase around any keyword list, and
// regex cannot judge whether information is materially non-public). The real
// safeguards are: (1) the AI Reg FD classifier (lib/ai.ts:classifyRegFD), and
// (2) mandatory human approval + counsel sign-off before anything publishes.
//
// "block" = clear touting/advice language; we refuse to publish until it's removed.
// "warn"  = surfaced to the approver to look at closely, but publishable.
// ─────────────────────────────────────────────────────────────────────────────
const RULES: { rule: string; pattern: RegExp; severity: "block" | "warn" }[] = [
  // Hard touting / advice language — clear enough to block outright.
  { rule: "Price prediction", pattern: /\b(price target|pt\s|going to \$|to \$?\d+|to the moon|moon\b|m0+n|\d+\s?x\b|will (double|triple|2x|3x)|skyrocket|triple digits|hit \$?\d+)\b/i, severity: "block" },
  { rule: "Valuation claim", pattern: /\b(under[- ]?valued|over[- ]?valued|deeply discounted|mis[- ]?priced|steal at|cheap stock|fraction of (its|what)|trading below (its )?(true|fair|intrinsic)? ?(value|worth)|hasn'?t figured out (our|the) value)\b/i, severity: "block" },
  { rule: "Investment advice", pattern: /\b(buy now|buy here|don'?t miss|last chance|get in (now|early)|load up|loading the boat|back ?up the truck|strong buy|accumulate|entry point|on the sidelines|smart money)\b/i, severity: "block" },
  { rule: "Guarantee / no-risk", pattern: /\b(guaranteed|risk[- ]?free|can'?t lose|cannot lose|can ?not lose|sure thing|no downside|basically no downside|no risk)\b/i, severity: "block" },
  // Material-non-public-information tells — flag for close review (often the real
  // Reg FD risk). Default to WARN so the human/counsel decides, not a regex.
  { rule: "Possible undisclosed material info", pattern: /\b(big news (coming|soon)|news (is )?coming|announcement (is )?(coming|pending|soon)|stay tuned|wait (until|til|till)|before (thursday|friday|monday|tuesday|wednesday|earnings|the announcement)|coming (next )?(week|month)|pending (deal|contract|announcement)|about to announce|can'?t say (yet|much)|more to come|exciting (news|update) (coming|soon))\b/i, severity: "warn" },
  { rule: "Possible guidance / projection", pattern: /\b(we expect|we project|guidance|on track to|will (deliver|achieve|hit|reach|generate)|next quarter (will|should)|revenue (will|should|is going to)|blow past|beat (guidance|estimates)|triples? revenue|double revenue)\b/i, severity: "warn" },
  { rule: "Unverifiable superlative", pattern: /\b(best[- ]in[- ]class|world[- ]class|revolutionary|game[- ]chang(er|ing)|unmatched|unprecedented|once[- ]in[- ]a[- ]lifetime)\b/i, severity: "warn" },
  { rule: "Forward-looking without basis", pattern: /\b(we will (dominate|win|crush)|explosive growth|imminent|massive upside|huge (gains|upside))\b/i, severity: "warn" },
];

// Normalize common evasion tricks (zero-width chars, letter-spacing like
// "d-o-u-b-l-e") so trivial obfuscation doesn't slip past the scan.
function normalize(s: string): string {
  const out = s.replace(/[​-‍﻿]/g, ""); // strip zero-width spaces
  // Collapse letter-by-letter spacing like "d-o-u-b-l-e" or "m o o n" — match a
  // run of 3+ single letters separated by a single -, ., or space, and remove the
  // separators. This leaves normal hyphenated words ("best-in-class", "10-Q") alone
  // because those have multi-character tokens, not all single letters.
  return out.replace(/\b(?:[A-Za-z][-.\s]){2,}[A-Za-z]\b/g, (m) => m.replace(/[-.\s]/g, ""));
}

export function checkContent(tweets: string[]): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const tweet of tweets) {
    const norm = normalize(tweet);
    for (const { rule, pattern, severity } of RULES) {
      const m = tweet.match(pattern) || norm.match(pattern);
      if (m) flags.push({ rule, excerpt: m[0], severity });
    }
  }
  return flags;
}

export function hasBlockingFlags(flags: ComplianceFlag[]): boolean {
  return flags.some((f) => f.severity === "block");
}

// Disclosures are appended at publish time and are not optional.
// publishThread is the ONLY path to "posted" status; it enforces every gate.
// NOTE: this thread form (used by the X draft flow) still carries both notices as
// separate tweets — it splits across a thread so length isn't an issue there.
export function buildPublishedThread(tweets: string[], company: Company): string[] {
  return [...tweets, `${company.flsText}`, `${company.disclosureText}`];
}

// Per-network hard character limits for a single post (Quick Post enforces these).
// Only X is tight; the rest comfortably hold the body + FLS note.
export const CHANNEL_LIMITS: Record<string, number> = {
  twitter: 280,
  linkedin: 3000,
  facebook: 5000,
  instagram: 2200,
  youtube: 5000,
  tiktok: 2200,
  telegram: 4096,
  reddit: 40000,
};

// Build the final post body for ONE channel. The company sends its OWN posts, so the
// third-party "compensated service provider" line is NOT appended — only the
// forward-looking-statements (FLS) safe-harbor note. On X (280 cap) we use a compact
// FLS note + a link to the company's public disclosures page instead of the full text.
export function buildChannelPost(text: string, company: Company, channel: string): string {
  const body = text.trim();
  if (channel === "twitter") {
    const ticker = String(company.ticker || "").toUpperCase();
    const link = ticker ? `pubcozone.com/t/${ticker}` : "pubcozone.com";
    const shortFls = `Forward-looking statements — see ${link}`;
    // Only add the note if it still fits; if the body alone is already at the limit,
    // the route's per-channel length guard will catch and report it.
    const candidate = `${body}\n\n${shortFls}`;
    return candidate.length <= CHANNEL_LIMITS.twitter ? candidate : body;
  }
  // All other channels: body + full FLS note (no compensated-provider line).
  return company.flsText ? `${body}\n\n${company.flsText}` : body;
}

export type PublishGateResult = { ok: true } | { ok: false; reason: string };

export function publishGate(opts: {
  status: string;
  flags: ComplianceFlag[];
  quietMode: boolean;
}): PublishGateResult {
  if (opts.quietMode) return { ok: false, reason: "Quiet mode is ON — publishing is suspended (pre-earnings/offering)." };
  if (opts.status !== "approved") return { ok: false, reason: "Only approved drafts can be published. Human approval is mandatory." };
  if (hasBlockingFlags(opts.flags)) return { ok: false, reason: "Draft contains blocked language. Edit it before publishing." };
  return { ok: true };
}

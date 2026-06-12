import type { Company, ComplianceFlag } from "./types";

// Patterns that make a post legally dangerous for a public company.
// "block" = the platform refuses to publish until the language is removed.
// "warn"  = surfaced to the approver but publishable.
const RULES: { rule: string; pattern: RegExp; severity: "block" | "warn" }[] = [
  { rule: "Price prediction", pattern: /\b(price target|going to \$|to the moon|10x|100x|will (double|triple)|skyrocket)\b/i, severity: "block" },
  { rule: "Valuation claim", pattern: /\b(undervalued|deeply discounted|mispriced|steal at|cheap stock)\b/i, severity: "block" },
  { rule: "Investment advice", pattern: /\b(buy now|don'?t miss|last chance|get in (now|early)|load up|back up the truck|strong buy)\b/i, severity: "block" },
  { rule: "Guarantee", pattern: /\b(guaranteed|risk[- ]free|can'?t lose|sure thing)\b/i, severity: "block" },
  { rule: "Unverifiable superlative", pattern: /\b(best[- ]in[- ]class|world[- ]class|revolutionary|game[- ]chang(er|ing)|unmatched)\b/i, severity: "warn" },
  { rule: "Forward-looking without basis", pattern: /\b(we will (dominate|win|crush)|explosive growth|imminent)\b/i, severity: "warn" },
];

export function checkContent(tweets: string[]): ComplianceFlag[] {
  const flags: ComplianceFlag[] = [];
  for (const tweet of tweets) {
    for (const { rule, pattern, severity } of RULES) {
      const m = tweet.match(pattern);
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
export function buildPublishedThread(tweets: string[], company: Company): string[] {
  return [...tweets, `${company.flsText}`, `${company.disclosureText}`];
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

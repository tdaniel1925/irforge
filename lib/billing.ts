import Stripe from "stripe";

// Stripe server client. Null when no key is set (keeps the app running for demos).
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

export function stripeMode(): "test" | "live" | "off" {
  const k = process.env.STRIPE_SECRET_KEY ?? "";
  if (k.startsWith("sk_test")) return "test";
  if (k.startsWith("sk_live")) return "live";
  return "off";
}

export type Tier = "free" | "board" | "starter" | "growth" | "pro";

// Tier ordering for upgrade/downgrade logic — every higher tier is a strict
// superset of the tiers below it (upgrades never lose features).
export const TIER_ORDER: Tier[] = ["free", "board", "starter", "growth", "pro"];

// ── Consumer (individual investor) plans — separate from company TIERS. ──
export type MemberPlan = "free" | "member_plus";

export const MEMBER_PLANS: Record<MemberPlan, { name: string; price: number; priceId?: string; perks: string[] }> = {
  free: {
    name: "Free",
    price: 0,
    perks: ["Post on company boards", "Watch up to 10 tickers", "Alerts on filings & halts", "Your investor profile"],
  },
  member_plus: {
    name: "Investor+",
    price: 9,
    priceId: process.env.STRIPE_PRICE_MEMBER_PLUS,
    perks: ["Unlimited watchlist", "Instant (real-time) alerts", "Portfolio-wide alert digest", "Priority board placement", "Ad-free"],
  },
};

// publishX (posting responses to X) is included on Starter+ — it's core IR value.
// Free is a verified public PAGE only: no dashboard tools.
// Board ($399) is the entry rung: manage your discussion board — the Q&A inbox with
// AI-drafted verified answers, notifications, question themes, sentiment — but no
// social publishing or the wider IR suite. Every tier is a strict superset of the
// tier below (see TIER_ORDER) so upgrading never loses a feature.
export const TIERS: Record<Tier, { name: string; price: number; priceId?: string; features: Feature[] }> = {
  free: { name: "Free", price: 0, features: ["page"] },
  board: { name: "Board", price: 399, priceId: process.env.STRIPE_PRICE_BOARD, features: ["page", "board", "qa"] },
  starter: { name: "Starter", price: 1500, priceId: process.env.STRIPE_PRICE_STARTER, features: ["page", "board", "qa", "publishX", "approvals", "audit", "proof", "vault"] },
  growth: { name: "Growth", price: 3500, priceId: process.env.STRIPE_PRICE_GROWTH, features: ["page", "board", "qa", "publishX", "approvals", "audit", "proof", "vault", "threats", "crm", "studio", "calendar", "captable"] },
  pro: { name: "Command", price: 6000, priceId: process.env.STRIPE_PRICE_PRO, features: ["page", "board", "qa", "publishX", "approvals", "audit", "proof", "vault", "threats", "crm", "studio", "calendar", "captable", "analyzer", "shortdefense"] },
};

export type Feature =
  | "page" | "publishX"
  | "approvals" | "board" | "audit" | "proof" | "vault"
  | "threats" | "qa" | "crm" | "studio" | "calendar" | "captable"
  | "analyzer" | "shortdefense";

// Which tier first unlocks each feature (for the "upgrade to unlock" messaging).
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  page: "free",
  board: "board", qa: "board",
  publishX: "starter", approvals: "starter", audit: "starter", proof: "starter", vault: "starter",
  threats: "growth", crm: "growth", studio: "growth", calendar: "growth", captable: "growth",
  analyzer: "pro", shortdefense: "pro",
};

export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  return TIERS[tier]?.features.includes(feature) ?? false;
}

// The free tier is just a claimed public page — no app/dashboard tools.
export function isPaid(tier: Tier): boolean {
  return tier !== "free" && tier !== undefined;
}

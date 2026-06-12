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

export type Tier = "starter" | "growth" | "pro";

export const TIERS: Record<Tier, { name: string; price: number; priceId?: string; features: Feature[] }> = {
  starter: { name: "Starter", price: 1500, priceId: process.env.STRIPE_PRICE_STARTER, features: ["approvals", "board", "audit", "proof", "vault"] },
  growth: { name: "Growth", price: 3500, priceId: process.env.STRIPE_PRICE_GROWTH, features: ["approvals", "board", "audit", "proof", "vault", "threats", "qa", "crm", "studio", "calendar", "captable"] },
  pro: { name: "Command", price: 6000, priceId: process.env.STRIPE_PRICE_PRO, features: ["approvals", "board", "audit", "proof", "vault", "threats", "qa", "crm", "studio", "calendar", "captable", "analyzer", "shortdefense"] },
};

export type Feature =
  | "approvals" | "board" | "audit" | "proof" | "vault"
  | "threats" | "qa" | "crm" | "studio" | "calendar" | "captable"
  | "analyzer" | "shortdefense";

// Which tier first unlocks each feature (for the "upgrade to unlock" messaging).
export const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  approvals: "starter", board: "starter", audit: "starter", proof: "starter", vault: "starter",
  threats: "growth", qa: "growth", crm: "growth", studio: "growth", calendar: "growth", captable: "growth",
  analyzer: "pro", shortdefense: "pro",
};

export function tierHasFeature(tier: Tier, feature: Feature): boolean {
  return TIERS[tier].features.includes(feature);
}

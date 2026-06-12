// Creates the PubcoZone products + quarterly prices in Stripe via the API.
// SAFE: creating products/prices does NOT charge anyone — it's catalog setup only.
// Subscriptions are only created when a real customer checks out.
// Run: node scripts/setup-stripe.mjs   (needs STRIPE_SECRET_KEY)

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error("STRIPE_SECRET_KEY not set"); process.exit(1); }
const mode = key.startsWith("sk_live") ? "LIVE" : key.startsWith("sk_test") ? "TEST" : "UNKNOWN";
console.log(`Stripe mode: ${mode}\n`);

const stripe = new Stripe(key);

// Quarterly billing: monthly price shown, charged every 3 months (interval_count: 3).
const PLANS = [
  { key: "starter", name: "PubcoZone Starter", monthly: 1500 },
  { key: "growth", name: "PubcoZone Growth", monthly: 3500 },
  { key: "pro", name: "PubcoZone Command", monthly: 6000 },
];

const out = {};
for (const p of PLANS) {
  // Idempotent-ish: reuse a product with the same name if it exists.
  const existing = await stripe.products.search({ query: `name:'${p.name}'` }).catch(() => ({ data: [] }));
  let product = existing.data?.[0];
  if (!product) {
    product = await stripe.products.create({ name: p.name, description: `${p.name} — billed quarterly` });
    console.log(`+ product ${p.name} (${product.id})`);
  } else {
    console.log(`= product ${p.name} already exists (${product.id})`);
  }

  // Quarterly price = monthly * 3, charged every 3 months.
  const price = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: p.monthly * 3 * 100, // cents, per quarter
    recurring: { interval: "month", interval_count: 3 },
    nickname: `${p.name} quarterly`,
  });
  out[p.key] = price.id;
  console.log(`  + price ${p.name}: $${p.monthly * 3}/quarter → ${price.id}\n`);
}

// Also a one-time setup fee price (used as a separate line item at checkout).
const setupProduct = (await stripe.products.search({ query: "name:'PubcoZone Setup Fee'" }).catch(() => ({ data: [] }))).data?.[0]
  ?? await stripe.products.create({ name: "PubcoZone Setup Fee", description: "One-time onboarding fee" });
const setupPrice = await stripe.prices.create({ product: setupProduct.id, currency: "usd", unit_amount: 250000 });
out.setup = setupPrice.id;
console.log(`+ setup fee: $2,500 one-time → ${setupPrice.id}\n`);

console.log("=== Add these to .env.local (and Vercel): ===");
console.log(`STRIPE_PRICE_STARTER=${out.starter}`);
console.log(`STRIPE_PRICE_GROWTH=${out.growth}`);
console.log(`STRIPE_PRICE_PRO=${out.pro}`);
console.log(`STRIPE_PRICE_SETUP=${out.setup}`);

import { NextResponse } from "next/server";
import { getStripe, TIERS, type Tier } from "@/lib/billing";
import { getMyCompany } from "@/lib/supabase/store";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST { tier } — start a Stripe Checkout session for the logged-in company.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const { tier } = (await req.json().catch(() => ({}))) as { tier: Tier };
  const t = TIERS[tier];
  if (!t?.priceId) return NextResponse.json({ error: "That plan isn't set up for checkout yet (missing price ID)." }, { status: 422 });

  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: t.priceId, quantity: 1 }],
    success_url: `${origin}/app?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancel`,
    client_reference_id: mine.id,
    metadata: { companyId: mine.id, tier },
  });

  // Stash the session intent so the webhook can match it back.
  const svc = createServiceClient();
  await svc.from("companies").update({ subscription_status: "trialing" }).eq("id", mine.id);

  return NextResponse.json({ url: session.url });
}

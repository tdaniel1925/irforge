import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { getMyCompany } from "@/lib/supabase/store";
import { createBriefOrder } from "@/lib/briefs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST — start a $3,500 one-time Checkout for a Sponsored Research Brief.
// Uses inline price_data so it works without a pre-created Stripe price.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const ticker = (mine.company.ticker || "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "Add your ticker in Settings first." }, { status: 422 });

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "payment", // one-time, not a subscription
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: 350000, // $3,500
        product_data: {
          name: `Sponsored Research Brief — $${ticker}`,
          description: "A company-sponsored, disclosed research brief prepared by PubcoZone from your public filings.",
        },
      },
    }],
    success_url: `${origin}/briefs?purchase=success`,
    cancel_url: `${origin}/briefs?purchase=cancel`,
    client_reference_id: mine.id,
    metadata: { kind: "sponsored_brief", companyId: mine.id, ticker },
  });

  // Record the order so the webhook can match payment → fulfillment.
  if (session.id) await createBriefOrder(mine.id, ticker, session.id);

  return NextResponse.json({ url: session.url });
}

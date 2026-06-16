import { NextResponse } from "next/server";
import { getStripe, MEMBER_PLANS, type MemberPlan } from "@/lib/billing";
import { getMyMember } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST { plan } — start a Stripe Checkout session for the logged-in member.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const { plan } = (await req.json().catch(() => ({}))) as { plan: MemberPlan };
  const p = MEMBER_PLANS[plan];
  if (!p?.priceId) return NextResponse.json({ error: "That plan isn't set up for checkout yet (missing price ID)." }, { status: 422 });

  const me = await getMyMember();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const origin = new URL(req.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: p.priceId, quantity: 1 }],
    success_url: `${origin}/member/billing?checkout=success`,
    cancel_url: `${origin}/member/billing?checkout=cancel`,
    client_reference_id: me.id,
    metadata: { memberId: me.id, plan },
  });

  // Status flips to 'active' only after the webhook confirms payment — no
  // premature 'trialing' write (it would strand abandoned checkouts).

  return NextResponse.json({ url: session.url });
}

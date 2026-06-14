import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { getMyMember } from "@/lib/members";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST — open the Stripe Customer Portal for the logged-in member.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const me = await getMyMember();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const svc = createServiceClient();
  const { data } = await svc.from("members").select("stripe_customer_id").eq("id", me.id).single();
  const customerId = data?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No billing account yet — subscribe first." }, { status: 422 });

  const origin = new URL(req.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/member/billing`,
  });
  return NextResponse.json({ url: portal.url });
}

import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { getMyCompany } from "@/lib/supabase/store";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// POST — open the Stripe Customer Portal so a customer can manage their subscription.
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing isn't configured." }, { status: 503 });

  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const svc = createServiceClient();
  const { data } = await svc.from("companies").select("stripe_customer_id").eq("id", mine.id).single();
  const customerId = data?.stripe_customer_id;
  if (!customerId) return NextResponse.json({ error: "No billing account yet — subscribe first." }, { status: 422 });

  const origin = new URL(req.url).origin;
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/billing`,
  });
  return NextResponse.json({ url: portal.url });
}

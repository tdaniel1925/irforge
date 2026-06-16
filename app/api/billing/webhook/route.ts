import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Stripe webhook — keeps each company's subscription status in sync with Stripe.
// Configure the endpoint URL in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ received: false }, { status: 503 });

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig!, secret);
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const svc = createServiceClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as { id?: string; client_reference_id?: string; customer?: string; subscription?: string; metadata?: { tier?: string; kind?: string } };
      // One-time Sponsored Brief purchase → generate the brief, don't touch the subscription.
      if (s.metadata?.kind === "sponsored_brief" && s.id) {
        const { fulfillBriefBySession } = await import("@/lib/briefs");
        await fulfillBriefBySession(s.id);
        break;
      }
      // Subscription checkout → activate the company's plan.
      if (s.client_reference_id) {
        await svc.from("companies").update({
          stripe_customer_id: s.customer ?? null,
          stripe_subscription_id: s.subscription ?? null,
          subscription_status: "active",
          tier: s.metadata?.tier ?? "growth",
        }).eq("id", s.client_reference_id);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as { id: string; status: string; customer: string };
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      await svc.from("companies").update({ subscription_status: status }).eq("stripe_subscription_id", sub.id);
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as { subscription?: string };
      if (inv.subscription) await svc.from("companies").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", inv.subscription);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

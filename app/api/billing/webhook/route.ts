import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Brief fulfillment runs an LLM generation inline — give it room instead of the
// default ~10s function timeout aborting mid-generation.
export const maxDuration = 300;

// Stripe webhook — keeps each company's subscription status in sync with Stripe.
// Configure the endpoint URL in the Stripe dashboard and set STRIPE_WEBHOOK_SECRET.
// IMPORTANT: any handler failure returns 5xx so Stripe RETRIES (up to ~3 days).
// Returning 200 on a failed write would mark the event delivered and permanently
// lose it (paid-but-inactive customers, paid-but-never-generated briefs).
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
        const r = await fulfillBriefBySession(s.id);
        if (!r.ok) {
          console.error("[billing webhook] brief fulfillment failed:", r.reason);
          // 5xx → Stripe retries; the reconcile-briefs cron is the long-tail backstop.
          return NextResponse.json({ error: `Brief fulfillment failed: ${r.reason}` }, { status: 500 });
        }
        break;
      }
      // Subscription checkout → activate the company's plan.
      if (s.client_reference_id) {
        const { error } = await svc.from("companies").update({
          stripe_customer_id: s.customer ?? null,
          stripe_subscription_id: s.subscription ?? null,
          subscription_status: "active",
          tier: s.metadata?.tier ?? "growth",
        }).eq("id", s.client_reference_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as { id: string; status: string; customer: string };
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      const { error } = await svc.from("companies").update({ subscription_status: status }).eq("stripe_subscription_id", sub.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "invoice.payment_failed": {
      // On Stripe API versions >= 2025-03-31 the subscription id moved to
      // invoice.parent.subscription_details.subscription — read both locations so
      // delinquent customers actually get marked past_due on either version.
      const inv = event.data.object as { subscription?: string; parent?: { subscription_details?: { subscription?: string } } };
      const subId = inv.subscription ?? inv.parent?.subscription_details?.subscription;
      if (subId) {
        const { error } = await svc.from("companies").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", subId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

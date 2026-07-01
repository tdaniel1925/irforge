import { NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Stripe webhook for MEMBER (consumer) subscriptions. Use a SEPARATE endpoint +
// secret (STRIPE_MEMBER_WEBHOOK_SECRET) so member and company events never
// collide. Keeps members.plan / subscription_status in sync with Stripe.
export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_MEMBER_WEBHOOK_SECRET;
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

  // Any failed write returns 5xx so Stripe RETRIES — a 200 on a failed update would
  // permanently desync the member's plan (paid-but-inactive, canceled-but-active).
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as { client_reference_id?: string; customer?: string; subscription?: string; metadata?: { plan?: string } };
      if (s.client_reference_id) {
        const { error } = await svc.from("members").update({
          stripe_customer_id: s.customer ?? null,
          stripe_subscription_id: s.subscription ?? null,
          subscription_status: "active",
          plan: s.metadata?.plan ?? "member_plus",
        }).eq("id", s.client_reference_id);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as { id: string; status: string };
      const status = event.type === "customer.subscription.deleted" ? "canceled" : sub.status;
      const plan = event.type === "customer.subscription.deleted" ? "free" : undefined;
      const patch: Record<string, string> = { subscription_status: status };
      if (plan) patch.plan = plan;
      const { error } = await svc.from("members").update(patch).eq("stripe_subscription_id", sub.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      break;
    }
    case "invoice.payment_failed": {
      // Field moved on Stripe API >= 2025-03-31 — read both locations.
      const inv = event.data.object as { subscription?: string; parent?: { subscription_details?: { subscription?: string } } };
      const subId = inv.subscription ?? inv.parent?.subscription_details?.subscription;
      if (subId) {
        const { error } = await svc.from("members").update({ subscription_status: "past_due" }).eq("stripe_subscription_id", subId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

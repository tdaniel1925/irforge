import { NextResponse } from "next/server";
import { getStripe, TIERS, type Tier } from "@/lib/billing";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Gate on platform super-admin (platform_admins), not the legacy companies.is_admin.
async function requireAdmin() {
  if (!(await isSuperAdmin())) return null;
  return createServiceClient();
}

// POST — admin actions for manual customer management.
// action: create_customer | send_subscription_invoice | charge_setup_fee | cancel_sub | comp
export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe) return NextResponse.json({ error: "Billing not configured." }, { status: 503 });
  const svc = await requireAdmin();
  if (!svc) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");

  try {
    // 1) Create or find a Stripe customer, and (optionally) attach to a company row.
    if (action === "create_customer") {
      const email = String(b.email ?? "").trim();
      const name = String(b.name ?? "").trim();
      if (!email || !name) return NextResponse.json({ error: "Name and email required." }, { status: 422 });

      const existing = await stripe.customers.list({ email, limit: 1 });
      const customer = existing.data[0] ?? (await stripe.customers.create({ email, name, metadata: { ticker: String(b.ticker ?? "") } }));

      // Link to a company row if a companyId was supplied; else just return the Stripe customer.
      if (b.companyId) {
        await svc.from("companies").update({ stripe_customer_id: customer.id }).eq("id", b.companyId);
      }
      return NextResponse.json({ ok: true, customerId: customer.id, email, name });
    }

    // 2) Send a subscription as a hosted INVOICE the customer pays themselves (no card handling).
    if (action === "send_subscription_invoice") {
      const customerId = String(b.customerId ?? "");
      const tier = String(b.tier ?? "growth") as Tier;
      const priceId = TIERS[tier]?.priceId;
      if (!customerId || !priceId) return NextResponse.json({ error: "Customer and a configured tier required." }, { status: 422 });

      // Subscription set to send an invoice the customer pays via a hosted link.
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        collection_method: "send_invoice",
        days_until_due: 14,
        metadata: { tier },
      });
      // Sync to the company if linked.
      if (b.companyId) {
        await svc.from("companies").update({ stripe_subscription_id: sub.id, subscription_status: "trialing", tier }).eq("id", b.companyId);
      }
      // Find the first invoice and return its hosted URL to send to the customer.
      const inv = await stripe.invoices.list({ customer: customerId, subscription: sub.id, limit: 1 });
      const invoice = inv.data[0];
      let hostedUrl = invoice?.hosted_invoice_url ?? null;
      if (invoice && invoice.status === "draft") {
        const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
        hostedUrl = finalized.hosted_invoice_url ?? hostedUrl;
      }
      return NextResponse.json({ ok: true, subscriptionId: sub.id, invoiceUrl: hostedUrl });
    }

    // 3) One-time setup fee as a hosted invoice.
    if (action === "charge_setup_fee") {
      const customerId = String(b.customerId ?? "");
      const setupPrice = process.env.STRIPE_PRICE_SETUP;
      if (!customerId || !setupPrice) return NextResponse.json({ error: "Customer and setup price required." }, { status: 422 });
      await stripe.invoiceItems.create({ customer: customerId, pricing: { price: setupPrice } });
      const invoice = await stripe.invoices.create({ customer: customerId, collection_method: "send_invoice", days_until_due: 14 });
      const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
      return NextResponse.json({ ok: true, invoiceUrl: finalized.hosted_invoice_url });
    }

    // 4) Cancel a subscription.
    if (action === "cancel_sub") {
      const subId = String(b.subscriptionId ?? "");
      if (!subId) return NextResponse.json({ error: "Subscription id required." }, { status: 422 });
      await stripe.subscriptions.cancel(subId);
      if (b.companyId) await svc.from("companies").update({ subscription_status: "canceled" }).eq("id", b.companyId);
      return NextResponse.json({ ok: true });
    }

    // 5) Comp: set a company active without payment (free/strategic accounts).
    if (action === "comp") {
      if (!b.companyId) return NextResponse.json({ error: "companyId required." }, { status: 422 });
      await svc.from("companies").update({ subscription_status: "active", tier: b.tier ?? "growth" }).eq("id", b.companyId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Stripe error" }, { status: 500 });
  }
}

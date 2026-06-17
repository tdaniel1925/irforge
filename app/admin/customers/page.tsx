"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, LoadingState, PageHeader } from "@/components/ui";

interface Company { id: string; name: string; ticker: string; tier: string; subscription_status: string; stripe_customer_id?: string; stripe_subscription_id?: string }

export default function AdminCustomers() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [busy, setBusy] = useState("");

  // New-customer form
  const [nc, setNc] = useState({ name: "", email: "", ticker: "", tier: "growth" });
  // Promo-invite form (everything free)
  const [promo, setPromo] = useState({ name: "", email: "" });

  const load = async () => {
    try {
      const res = await fetch("/api/admin");
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Failed.");
      else { setCompanies(d.companies ?? []); setError(null); }
    } catch { setError("Network error."); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const act = async (body: object, success?: string): Promise<{ ok?: boolean; invoiceUrl?: string; customerId?: string; error?: string }> => {
    setNotice(null);
    const res = await fetch("/api/admin/customer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setNotice({ text: data.error ?? "Failed.", tone: "error" }); return data; }
    if (success) setNotice({ text: success, tone: "success" });
    await load();
    return data;
  };

  const createCustomer = async () => {
    setBusy("create");
    const r = await act({ action: "create_customer", ...nc });
    if (r.customerId) { setNotice({ text: `Stripe customer created (${r.customerId}). Now subscribe them below.`, tone: "success" }); setNc({ name: "", email: "", ticker: "", tier: "growth" }); }
    setBusy("");
  };

  const subscribe = async (c: Company, tier: string) => {
    setBusy(c.id);
    if (!c.stripe_customer_id) { setNotice({ text: "This company has no Stripe customer yet — create one first.", tone: "error" }); setBusy(""); return; }
    const r = await act({ action: "send_subscription_invoice", customerId: c.stripe_customer_id, companyId: c.id, tier });
    if (r.invoiceUrl) setNotice({ text: `Subscription created. Send this invoice to the customer: ${r.invoiceUrl}`, tone: "success" });
    setBusy("");
  };

  const setupFee = async (c: Company) => {
    setBusy(c.id + "fee");
    if (!c.stripe_customer_id) { setNotice({ text: "Create a Stripe customer first.", tone: "error" }); setBusy(""); return; }
    const r = await act({ action: "charge_setup_fee", customerId: c.stripe_customer_id });
    if (r.invoiceUrl) setNotice({ text: `Setup-fee invoice created: ${r.invoiceUrl}`, tone: "success" });
    setBusy("");
  };

  const comp = async (c: Company) => { setBusy(c.id + "comp"); await act({ action: "comp", companyId: c.id, tier: c.tier }, `${c.name} comped to active.`); setBusy(""); };
  const compFull = async (c: Company) => { setBusy(c.id + "full"); await act({ action: "comp_full", companyId: c.id }, `${c.name || "Company"} now has everything free (Command tier + all features).`); setBusy(""); };
  const cancel = async (c: Company) => { setBusy(c.id + "cancel"); await act({ action: "cancel_sub", subscriptionId: c.stripe_subscription_id, companyId: c.id }, "Subscription canceled."); setBusy(""); };

  const invitePromo = async () => {
    setBusy("promo");
    const r = await act({ action: "promo_invite", name: promo.name, email: promo.email });
    if (r.ok) { setNotice({ text: `Promo invite sent to ${promo.email} — full free access.`, tone: "success" }); setPromo({ name: "", email: "" }); }
    setBusy("");
  };

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="max-w-2xl"><PageHeader title="Customer Management" subtitle="Admins only." /><Banner tone="error" message={error === "Admin only" ? "This area is for administrators only." : error} /></div>
  );

  return (
    <div>
      <PageHeader title="Customer Management" subtitle="Set up customers, send them a subscription invoice they pay via Stripe, charge the setup fee, comp strategic accounts, or cancel. You never handle card numbers — customers pay through Stripe's hosted page." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {/* Invite a promo company — everything free */}
      <Card className="mb-6 border-emerald-500/30 bg-emerald-500/[0.04]">
        <h2 className="font-semibold text-app">🎁 Invite a promo company — everything free</h2>
        <p className="mb-3 mt-1 text-sm text-muted">Creates a comped account on the top (Command) tier with every feature unlocked, and emails them a link to set up. No card, no charge.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input value={promo.name} onChange={(e) => setPromo({ ...promo, name: e.target.value })} placeholder="Company name (optional)" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <input value={promo.email} onChange={(e) => setPromo({ ...promo, email: e.target.value })} placeholder="Their email" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <Button onClick={invitePromo} disabled={busy === "promo" || !promo.email}>{busy === "promo" ? "Sending…" : "Send free-access invite"}</Button>
        </div>
      </Card>

      {/* Create a new customer */}
      <Card className="mb-6">
        <h2 className="mb-3 font-semibold text-app">Add a customer to Stripe</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder="Company name" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} placeholder="Billing email" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <input value={nc.ticker} onChange={(e) => setNc({ ...nc, ticker: e.target.value.toUpperCase() })} placeholder="Ticker" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <Button onClick={createCustomer} disabled={busy === "create" || !nc.name || !nc.email}>{busy === "create" ? "…" : "Create in Stripe"}</Button>
        </div>
        <p className="mt-2 text-xs text-faint">This creates the Stripe customer. To also link it to an existing app account, use the table below after they sign up.</p>
      </Card>

      {/* Existing companies */}
      <Card>
        <h2 className="mb-3 font-semibold text-app">Companies</h2>
        <div className="space-y-3">
          {companies.map((c) => (
            <div key={c.id} className="rounded-lg border border-app bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-app">{c.name || "(not onboarded)"} {c.ticker && <span className="text-faint">${c.ticker}</span>}</p>
                  <p className="text-xs text-muted">
                    {c.tier} · <span className={c.subscription_status === "active" ? "text-emerald-600 dark:text-emerald-400" : c.subscription_status === "past_due" ? "text-red-500" : "text-faint"}>{c.subscription_status}</span>
                    {c.stripe_customer_id ? ` · Stripe ✓` : " · no Stripe customer"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select defaultValue={c.tier} id={`tier-${c.id}`} className="rounded border border-app bg-surface-2 px-2 py-1.5 text-xs text-app focus:outline-none">
                    <option value="starter">Starter</option><option value="growth">Growth</option><option value="pro">Command</option>
                  </select>
                  <Button onClick={() => subscribe(c, (document.getElementById(`tier-${c.id}`) as HTMLSelectElement).value)} disabled={busy === c.id}>{busy === c.id ? "…" : "Send subscription invoice"}</Button>
                  <Button variant="secondary" onClick={() => setupFee(c)} disabled={busy === c.id + "fee"}>Setup fee</Button>
                  <Button variant="secondary" onClick={() => comp(c)} disabled={busy === c.id + "comp"}>Comp</Button>
                  <Button variant="secondary" onClick={() => compFull(c)} disabled={busy === c.id + "full"} title="Command tier + every feature, free">{busy === c.id + "full" ? "…" : "🎁 Comp full (free)"}</Button>
                  {c.stripe_subscription_id && <Button variant="danger" onClick={() => cancel(c)} disabled={busy === c.id + "cancel"}>Cancel</Button>}
                </div>
              </div>
            </div>
          ))}
          {companies.length === 0 && <p className="py-6 text-center text-sm text-faint">No companies yet.</p>}
        </div>
      </Card>

      <p className="mt-6 text-xs text-faint">For charging a card you hold on the customer&apos;s behalf, use the Stripe Dashboard directly — this console only sends hosted invoices, so you never touch raw card data (keeps you out of PCI scope).</p>
    </div>
  );
}

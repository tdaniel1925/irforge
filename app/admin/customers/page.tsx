"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, LoadingState, PageHeader } from "@/components/ui";
import CustomerConsole from "@/components/CustomerConsole";

interface Company { id: string; name: string; ticker: string; tier: string; subscription_status: string; stripe_customer_id?: string; stripe_subscription_id?: string }
interface EmailEvent { id: string; message_id?: string; to_email: string; kind: string; subject: string; status: string; sent_at?: string; delivered_at?: string; opened_at?: string; error?: string }

export default function AdminCustomers() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" | "info" } | null>(null);
  const [busy, setBusy] = useState("");

  // New-customer form
  const [nc, setNc] = useState({ name: "", email: "", ticker: "", tier: "growth" });
  // Promo-invite form (everything free) — company, contact name, email, custom message
  const [promo, setPromo] = useState({ name: "", contactName: "", email: "", message: "" });
  const [promoPreview, setPromoPreview] = useState(false);
  const [msgTouched, setMsgTouched] = useState(false);

  // Email delivery log
  const [emails, setEmails] = useState<EmailEvent[]>([]);
  const [emailsOpen, setEmailsOpen] = useState(false);
  const [emailFilter, setEmailFilter] = useState("");
  const [emailsBusy, setEmailsBusy] = useState(false);
  const loadEmails = async (filter = "") => {
    setEmailsBusy(true);
    try {
      const url = "/api/admin/customer" + (filter.trim() ? `?email=${encodeURIComponent(filter.trim())}` : "");
      const res = await fetch(url);
      const d = await res.json().catch(() => ({}));
      if (res.ok) setEmails(d.events ?? []);
    } finally {
      setEmailsBusy(false);
    }
  };

  // The default message (kept in sync with the inputs until the admin edits it).
  const defaultMsg = (() => {
    const hi = promo.contactName.trim() ? `Hi ${promo.contactName.trim()},` : "Hi there,";
    const who = promo.name.trim() ? ` for ${promo.name.trim()}` : "";
    return `${hi}\n\nPubcoZone is an AI investor-relations platform for public companies — turn your SEC filings into compliant updates you approve, answer investors on the record, and reach the funds that hold your peers. Nothing ever posts without your approval.\n\nYou've been set up with full, free access${who} — every feature, no charge and no card required. Click the button below to activate your account with this email and connect your ticker.`;
  })();
  const effectiveMsg = msgTouched ? promo.message : defaultMsg;

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
    else if (r.ok) setNotice({ text: "Stripe customer created.", tone: "success" });
    setBusy("");
  };

  const subscribe = async (c: Company, tier: string) => {
    setBusy(c.id);
    if (!c.stripe_customer_id) { setNotice({ text: "This company has no Stripe customer yet — create one first.", tone: "error" }); setBusy(""); return; }
    const r = await act({ action: "send_subscription_invoice", customerId: c.stripe_customer_id, companyId: c.id, tier });
    if (r.invoiceUrl) setNotice({ text: `Subscription created. Send this invoice to the customer: ${r.invoiceUrl}`, tone: "success" });
    else if (r.ok) setNotice({ text: "Subscription created. The invoice is being generated in Stripe — check the Stripe dashboard for the hosted link.", tone: "info" });
    setBusy("");
  };

  const setupFee = async (c: Company) => {
    setBusy(c.id + "fee");
    if (!c.stripe_customer_id) { setNotice({ text: "Create a Stripe customer first.", tone: "error" }); setBusy(""); return; }
    const r = await act({ action: "charge_setup_fee", customerId: c.stripe_customer_id });
    if (r.invoiceUrl) setNotice({ text: `Setup-fee invoice created: ${r.invoiceUrl}`, tone: "success" });
    else if (r.ok) setNotice({ text: "Setup-fee invoice created — check the Stripe dashboard for the hosted link.", tone: "info" });
    setBusy("");
  };

  const comp = async (c: Company) => { setBusy(c.id + "comp"); await act({ action: "comp", companyId: c.id, tier: c.tier }, `${c.name} comped to active.`); setBusy(""); };
  const compFull = async (c: Company) => { setBusy(c.id + "full"); await act({ action: "comp_full", companyId: c.id }, `${c.name || "Company"} now has everything free (Command tier + all features).`); setBusy(""); };
  // Start impersonating a company, then go to their dashboard. Everything in the app
  // then acts as that company until you click "Exit" in the impersonation banner.
  const impersonate = async (c: Company) => {
    setBusy(c.id + "imp");
    try {
      const res = await fetch("/api/admin/impersonate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: c.id }) });
      const d = await res.json();
      if (!res.ok) { setNotice({ text: d.error ?? "Couldn't start impersonation.", tone: "error" }); setBusy(""); return; }
      window.location.href = "/app";
    } catch { setNotice({ text: "Network error.", tone: "error" }); setBusy(""); }
  };
  const cancel = async (c: Company) => { setBusy(c.id + "cancel"); await act({ action: "cancel_sub", subscriptionId: c.stripe_subscription_id, companyId: c.id }, "Subscription canceled."); setBusy(""); };

  const invitePromo = async () => {
    setBusy("promo");
    const r = await act({ action: "promo_invite", name: promo.name, contactName: promo.contactName, email: promo.email, message: msgTouched ? promo.message : "" });
    if (r.ok) {
      setNotice({ text: `Promo invite sent to ${promo.email} — full free access.`, tone: "success" });
      setPromo({ name: "", contactName: "", email: "", message: "" });
      setMsgTouched(false); setPromoPreview(false);
    }
    setBusy("");
  };

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="max-w-2xl"><PageHeader title="Customer Management" subtitle="Admins only." /><Banner tone="error" message={error === "Admin only" ? "This area is for administrators only." : error} /></div>
  );

  return (
    <div>
      <PageHeader title="Customer Management" subtitle="Every customer's billing, usage, team, and connections in one place. Archive or delete accounts, comp strategic ones, and run Stripe billing — all from here." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {/* Comprehensive console: search, billing, usage, archive/delete, drawer. */}
      <CustomerConsole />

      {/* Invite a promo company — everything free */}
      <Card className="mb-6 border-emerald-500/30 bg-emerald-500/[0.04]">
        <h2 className="font-semibold text-app">🎁 Invite a promo company — everything free</h2>
        <p className="mb-3 mt-1 text-sm text-muted">Creates a comped account on the top (Command) tier with every feature unlocked, and emails them a link to set up. No card, no charge.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input value={promo.name} onChange={(e) => setPromo({ ...promo, name: e.target.value })} placeholder="Company name" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <input value={promo.contactName} onChange={(e) => setPromo({ ...promo, contactName: e.target.value })} placeholder="Contact name (optional)" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          <input value={promo.email} onChange={(e) => setPromo({ ...promo, email: e.target.value })} placeholder="Contact email" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
        </div>

        {/* Preview & edit dropdown */}
        <button onClick={() => setPromoPreview((v) => !v)} className="mt-3 text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          {promoPreview ? "▾ Hide email preview" : "▸ Preview & edit the email"}
        </button>
        {promoPreview && (
          <div className="mt-3 rounded-xl border border-app bg-surface p-4">
            <label className="mb-1 block text-xs font-medium text-muted">Message (edit freely — the activation button can&apos;t be removed)</label>
            <textarea
              value={effectiveMsg}
              onChange={(e) => { setMsgTouched(true); setPromo({ ...promo, message: e.target.value }); }}
              rows={7}
              className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
            />
            {msgTouched && (
              <button onClick={() => { setMsgTouched(false); setPromo({ ...promo, message: "" }); }} className="mt-1 text-xs text-faint hover:text-muted">↺ Reset to default</button>
            )}
            {/* Live preview of the actual email (white, logo, locked button) */}
            <p className="mt-4 mb-1 text-xs font-medium text-muted">Preview</p>
            <div className="overflow-hidden rounded-lg border border-app" style={{ background: "#f1f5f9" }}>
              <div style={{ maxWidth: 560, margin: "12px auto", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "14px 22px", borderBottom: "1px solid #eef2f7", fontWeight: 800, fontSize: 18 }}>
                  <span style={{ color: "#0f172a" }}>Pubco</span><span style={{ color: "#059669" }}>Zone.</span>
                </div>
                <div style={{ padding: "20px 22px", color: "#334155" }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 10px" }}>You&apos;ve been given free access to PubcoZone 🎁</p>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#475569", whiteSpace: "pre-wrap", margin: "0 0 16px" }}>{effectiveMsg}</p>
                  <span style={{ display: "inline-block", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 13, padding: "9px 18px", borderRadius: 8 }}>Activate free access →</span>
                  <p style={{ fontSize: 11, color: "#94a3b8", margin: "14px 0 0" }}>🔒 The button + activation link are always included and can&apos;t be edited out.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-3">
          <Button onClick={invitePromo} disabled={busy === "promo" || !promo.email}>{busy === "promo" ? "Sending…" : "Send free-access invite"}</Button>
        </div>
      </Card>

      {/* Email delivery log — confirm invites & welcomes actually arrived */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-app">📬 Email delivery log</h2>
          <button
            onClick={() => { const next = !emailsOpen; setEmailsOpen(next); if (next && emails.length === 0) loadEmails(); }}
            className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            {emailsOpen ? "▾ Hide" : "▸ Show delivery status"}
          </button>
        </div>
        <p className="mb-3 mt-1 text-sm text-muted">Every invite and welcome email we send, with delivery status and timestamps from Resend.</p>
        {emailsOpen && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <input
                value={emailFilter}
                onChange={(e) => setEmailFilter(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") loadEmails(emailFilter); }}
                placeholder="Filter by email (optional)"
                className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none"
              />
              <Button variant="secondary" onClick={() => loadEmails(emailFilter)} disabled={emailsBusy}>{emailsBusy ? "…" : "↻ Refresh"}</Button>
            </div>
            {emails.length === 0 ? (
              <p className="py-4 text-sm text-faint">{emailsBusy ? "Loading…" : "No emails logged yet."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-app text-left text-xs text-faint">
                      <th className="py-2 pr-3 font-medium">Recipient</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Sent</th>
                      <th className="py-2 pr-3 font-medium">Delivered / Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((e) => (
                      <tr key={e.id} className="border-b border-app/50 align-top">
                        <td className="py-2 pr-3 text-app">{e.to_email}</td>
                        <td className="py-2 pr-3 text-muted">{e.kind || "—"}</td>
                        <td className="py-2 pr-3"><EmailStatus e={e} /></td>
                        <td className="py-2 pr-3 text-muted">{fmtTs(e.sent_at)}</td>
                        <td className="py-2 pr-3 text-muted">
                          {e.opened_at ? `Opened ${fmtTs(e.opened_at)}` : e.delivered_at ? `Delivered ${fmtTs(e.delivered_at)}` : "—"}
                          {e.error ? <span className="block text-xs text-red-500">{e.error}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
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
                  <Button variant="secondary" onClick={() => impersonate(c)} disabled={busy === c.id + "imp"} title="Log in as this company to make changes">{busy === c.id + "imp" ? "…" : "👁 Act as"}</Button>
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

function fmtTs(ts?: string): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function EmailStatus({ e }: { e: EmailEvent }) {
  const map: Record<string, { label: string; cls: string }> = {
    opened: { label: "Opened ✓", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    delivered: { label: "Delivered ✓", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
    sent: { label: "Sent", cls: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
    delayed: { label: "Delayed", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
    bounced: { label: "Bounced ✕", cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
    complained: { label: "Spam ✕", cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
    failed: { label: "Failed ✕", cls: "bg-red-500/15 text-red-600 dark:text-red-300" },
  };
  const s = map[e.status] ?? { label: e.status, cls: "bg-app-hover text-faint" };
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

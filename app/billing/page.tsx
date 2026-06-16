"use client";

import { useEffect, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { Notice } from "@/components/ui";

const PLANS = [
  { tier: "free", name: "Free", price: "$0", blurb: "A verified public page on PubcoZone — your profile, filings, and data. No dashboard tools." },
  { tier: "starter", name: "Starter", price: "$1,500", blurb: "Everything to run IR: post responses to X, filing-to-post drafting, the board, vault, monthly proof." },
  { tier: "growth", name: "Growth", price: "$3,500", popular: true, blurb: "+ Threat Radar, AI Q&A, Investor CRM, Writing Studio, IR calendar, cap table." },
  { tier: "pro", name: "Command", price: "$6,000", blurb: "+ AI Document Analyzer, short-attack defense, dedicated onboarding." },
];

export default function Billing() {
  const { db, error } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("checkout") === "cancel") setNotice({ text: "Checkout canceled — no charge was made.", tone: "info" });
    else if (p.get("checkout") === "success") setNotice({ text: "🎉 You're subscribed! Your plan updates within a few seconds.", tone: "success" });
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const currentTier = (db.company as { tier?: string }).tier ?? "growth";
  const status = (db.company as { subscription_status?: string }).subscription_status ?? "none";
  const live = (db as { stripeMode?: string }).stripeMode === "live";

  const subscribe = async (tier: string) => {
    setBusy(tier); setNotice(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier }) });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setNotice({ text: data.error ?? "Couldn't start checkout.", tone: "error" });
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(""); }
  };

  const manage = async () => {
    setBusy("portal"); setNotice(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setNotice({ text: data.error ?? "Couldn't open billing portal.", tone: "error" });
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(""); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Billing & Plan" subtitle="Your subscription. Billed quarterly. Change plans anytime." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      {live && <Banner tone="info" message="Live billing is active — subscribing charges a real card. Use test-mode Stripe keys for trying it out." />}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted">Current plan</p>
            <p className="text-lg font-semibold text-app">{PLANS.find((p) => p.tier === currentTier)?.name ?? "—"} · <span className={`text-sm ${status === "active" ? "text-emerald-600 dark:text-emerald-400" : status === "past_due" ? "text-red-500" : "text-faint"}`}>{status}</span></p>
          </div>
          {(status === "active" || status === "past_due") && <Button variant="secondary" onClick={manage} disabled={busy === "portal"}>{busy === "portal" ? "…" : "Manage subscription"}</Button>}
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-4">
        {PLANS.map((p) => (
          <Card key={p.tier} className={p.popular ? "border-emerald-500" : ""}>
            {p.popular && <span className="mb-2 inline-block rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white">MOST POPULAR</span>}
            <h3 className="font-semibold text-app">{p.name}</h3>
            <p className="mt-1 text-2xl font-bold text-app">{p.price}{p.tier !== "free" && <span className="text-sm font-normal text-faint">/mo</span>}</p>
            <p className="mt-2 text-sm text-muted">{p.blurb}</p>
            {currentTier === p.tier ? (
              <p className="mt-4 text-center text-sm font-medium text-emerald-600 dark:text-emerald-400">Your current plan</p>
            ) : p.tier === "free" ? (
              <p className="mt-4 text-center text-xs text-faint">Free is your starting page — upgrade to unlock the tools.</p>
            ) : (
              <Button onClick={() => subscribe(p.tier)} disabled={busy === p.tier} variant={p.popular ? "primary" : "secondary"}>
                {busy === p.tier ? "…" : status === "active" ? "Switch to this plan" : "Subscribe"}
              </Button>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-faint">Plus a one-time $2,500 setup fee on first subscription. Cash/card only — we never accept stock as payment.</p>
    </div>
  );
}

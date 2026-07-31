"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, LoadingState, PageHeader } from "@/components/ui";
import { SectionLabel, SoftCard, MetricTile } from "@/components/admin/ui";

interface ClaimDoc { name: string; url: string }
interface Claim {
  id: string; ticker: string; company_name?: string; name: string; title?: string;
  relationship?: string; email: string; phone?: string; role: string; notes?: string;
  status: string; created_at: string; docs?: ClaimDoc[];
}
interface AdminData {
  companies: { id: string; name: string; ticker: string; tier: string; subscription_status: string; onboarding_complete: boolean; created_at: string }[];
  claims: Claim[];
  stats: { total: number; active: number; pastDue: number; mrr: number; pendingClaims: number };
}

export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [busyClaim, setBusyClaim] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/admin");
      const d = await res.json();
      if (!res.ok) setError(d.error ?? "Failed.");
      else { setData(d); setError(null); }
    } catch { setError("Network error."); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const claim = async (id: string, status: string) => {
    setBusyClaim(id + status);
    setNotice(null);
    try {
      const res = await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice({ text: d.error ?? "Could not update the claim. Try again.", tone: "error" }); return; }
      setNotice({ text: status === "verified" ? "Claim verified." : "Claim rejected.", tone: "success" });
      await load();
    } catch {
      setNotice({ text: "Network error. Try again.", tone: "error" });
    } finally { setBusyClaim(null); }
  };

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="max-w-2xl">
      <PageHeader title="Admin" subtitle="BotMakers operations console." />
      <Banner tone="error" message={error === "Admin only" ? "This area is for PubcoZone administrators only." : error} />
      <p className="mt-3 text-xs text-faint">To grant admin: add your user to the <code>platform_admins</code> table with <code>super_admin = true</code> (insert user_id + email), then reload. Make sure you&apos;re signed in with the right account.</p>
    </div>
  );
  if (!data) return null;

  const money = (n: number) => `$${n.toLocaleString()}`;

  const pendingClaims = data.claims.filter((c) => c.status === "pending");

  // The admin console's destinations — grouped so the console is a clear HUB, not
  // a scattered pile of links. Each card is one place with one purpose.
  const DESTINATIONS: { href: string; icon: string; title: string; desc: string; badge?: number }[] = [
    { href: "/admin/customers", icon: "🏢", title: "Customers", desc: "Paying & comped companies — billing, comp, act-as, delete" },
    { href: "/admin/users", icon: "👥", title: "Users", desc: "Every teammate, grouped by their company" },
    { href: "/admin/investors", icon: "👤", title: "Investors", desc: "Individual investor accounts — suspend, plan, delete" },
    { href: "/admin/metrics", icon: "📊", title: "Metrics", desc: "Platform-wide engagement, traffic & email health" },
    { href: "/admin/features", icon: "🎚", title: "Feature access", desc: "Per-company feature toggles" },
    { href: "/admin/leads", icon: "🧲", title: "Lead Finder", desc: "Build outreach lists from SEC EDGAR" },
  ];

  return (
    <div>
      <PageHeader title="Admin Console" subtitle="Your operations hub. Admins only." />

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {/* Headline KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Active subs" value={data.stats.active} />
        <MetricTile label="MRR" value={money(data.stats.mrr)} />
        <MetricTile label="Past due" value={data.stats.pastDue} trend={data.stats.pastDue > 0 ? "up" : null} upIsGood={false} />
        <MetricTile label="Pending claims" value={data.stats.pendingClaims} trend={data.stats.pendingClaims > 0 ? "up" : null} upIsGood={false} />
      </div>

      {/* Destination hub */}
      <SectionLabel>Manage</SectionLabel>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {DESTINATIONS.map((d) => (
          <Link key={d.href} href={d.href} className="group rounded-2xl border border-app bg-surface p-5 shadow-sm transition hover:border-emerald-500/40 hover:shadow-md">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{d.icon}</span>
              <div>
                <p className="font-semibold text-app group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{d.title} →</p>
                <p className="mt-0.5 text-xs text-muted">{d.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Claims queue — the one action that needs the admin's attention lives here. */}
      {pendingClaims.length > 0 && (
        <>
          <SectionLabel>Action needed — claim requests to verify ({pendingClaims.length})</SectionLabel>
          <SoftCard className="mb-6"><div className="-mt-1">
          <h2 className="sr-only">Claim requests to verify</h2>
          <div className="space-y-3">
            {pendingClaims.map((c) => (
              <div key={c.id} className="rounded-lg border border-app bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-app">${c.ticker} — {c.company_name || "(company name n/a)"}</p>
                    <p className="mt-0.5 text-muted">
                      {c.name}{c.title ? `, ${c.title}` : ""} · <span className="capitalize">{c.relationship || c.role || "role n/a"}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {c.email}{c.phone ? ` · ${c.phone}` : ""} · submitted {c.created_at?.slice(0, 10)}
                    </p>
                    {c.notes && <p className="mt-1 text-xs italic text-muted">&ldquo;{c.notes}&rdquo;</p>}
                    {/* Proof documents — signed private links */}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(c.docs ?? []).length > 0 ? (
                        (c.docs ?? []).map((d, i) => (
                          <a key={i} href={d.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-app bg-surface px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-app-hover dark:text-emerald-300">
                            📎 {d.name.length > 28 ? d.name.slice(0, 25) + "…" : d.name}
                          </a>
                        ))
                      ) : (
                        <span className="text-xs text-amber-600 dark:text-amber-400">⚠ no documents attached</span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button onClick={() => claim(c.id, "verified")} disabled={busyClaim === c.id + "verified"}>{busyClaim === c.id + "verified" ? "…" : "✓ Verify"}</Button>
                    <Button variant="danger" onClick={() => claim(c.id, "rejected")} disabled={busyClaim === c.id + "rejected"}>{busyClaim === c.id + "rejected" ? "…" : "Reject"}</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">Verifying marks the claim approved. Document links are private and expire in 1 hour.</p>
          </div></SoftCard>
        </>
      )}
    </div>
  );
}

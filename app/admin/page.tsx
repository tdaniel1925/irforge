"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, LoadingState, PageHeader } from "@/components/ui";

interface AdminData {
  companies: { id: string; name: string; ticker: string; tier: string; subscription_status: string; onboarding_complete: boolean; created_at: string }[];
  claims: { id: string; ticker: string; name: string; email: string; role: string; status: string; created_at: string }[];
  stats: { total: number; active: number; pastDue: number; mrr: number; pendingClaims: number };
}

export default function Admin() {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
    await fetch("/api/admin", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    await load();
  };

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="max-w-2xl">
      <PageHeader title="Admin" subtitle="BotMakers operations console." />
      <Banner tone="error" message={error === "Admin only" ? "This area is for PubcoZone administrators only." : error} />
      <p className="mt-3 text-xs text-faint">To grant admin: run the SQL in supabase/schema-billing.sql setting is_admin = true for your user, then sign in.</p>
    </div>
  );
  if (!data) return null;

  const money = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div>
      <PageHeader title="Admin Console" subtitle="Every company, your revenue, and the claim-request queue. Admins only.">
        <div className="flex gap-2">
          <Link href="/admin/features" className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-app-hover">Feature access →</Link>
          <Link href="/admin/customers" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">Customer management →</Link>
        </div>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Companies" value={data.stats.total} />
        <Stat label="Active subs" value={data.stats.active} />
        <Stat label="MRR" value={money(data.stats.mrr)} />
        <Stat label="Past due" value={data.stats.pastDue} accent={data.stats.pastDue > 0} />
        <Stat label="Pending claims" value={data.stats.pendingClaims} accent={data.stats.pendingClaims > 0} />
      </div>

      {data.claims.filter((c) => c.status === "pending").length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-app">Claim requests to verify</h2>
          <div className="space-y-2">
            {data.claims.filter((c) => c.status === "pending").map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app bg-surface-2 px-4 py-3">
                <div className="text-sm">
                  <span className="font-medium text-app">${c.ticker}</span> — {c.name} ({c.role || "role n/a"}) · <span className="text-muted">{c.email}</span>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => claim(c.id, "verified")}>Verify</Button>
                  <Button variant="danger" onClick={() => claim(c.id, "rejected")}>Reject</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 font-semibold text-app">All companies</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app text-left text-xs text-faint"><th className="py-2 pr-4 font-medium">Company</th><th className="py-2 pr-4 font-medium">Ticker</th><th className="py-2 pr-4 font-medium">Tier</th><th className="py-2 pr-4 font-medium">Status</th><th className="py-2 font-medium">Joined</th></tr></thead>
            <tbody>
              {data.companies.map((c) => (
                <tr key={c.id} className="border-b border-app">
                  <td className="py-2 pr-4 text-app">{c.name || <span className="text-faint">(not onboarded)</span>}</td>
                  <td className="py-2 pr-4 text-muted">{c.ticker ? "$" + c.ticker : "—"}</td>
                  <td className="py-2 pr-4 text-muted">{c.tier}</td>
                  <td className="py-2 pr-4"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${c.subscription_status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : c.subscription_status === "past_due" ? "bg-red-500/15 text-red-500" : "bg-slate-500/15 text-faint"}`}>{c.subscription_status}</span></td>
                  <td className="py-2 text-faint">{c.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className={accent ? "border-amber-500/40" : ""}>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-app">{value}</p>
    </Card>
  );
}

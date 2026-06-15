"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Card, LoadingState, PageHeader } from "@/components/ui";

interface Feature { key: string; label: string; icon: string }
interface Company { id: string; name: string; ticker: string; tier: string; features: Record<string, boolean> }
interface AuditRow { id: string; actorEmail: string | null; action: string; entityType: string | null; entityId: string | null; createdAt: string }

export default function AdminFeatures() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = async () => {
    try {
      const res = await fetch("/api/admin/features");
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed."); return; }
      setCompanies(d.companies); setFeatures(d.features); setAudit(d.audit); setError(null);
    } catch { setError("Network error."); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (companyId: string, feature: string, next: boolean) => {
    const id = `${companyId}:${feature}`;
    setSaving(id);
    // optimistic
    setCompanies((cs) => cs.map((c) => c.id === companyId ? { ...c, features: { ...c.features, [feature]: next } } : c));
    try {
      const res = await fetch("/api/admin/features", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, feature, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // revert on failure
      setCompanies((cs) => cs.map((c) => c.id === companyId ? { ...c, features: { ...c.features, [feature]: !next } } : c));
    } finally { setSaving(null); }
  };

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="max-w-2xl">
      <PageHeader title="Feature Access" subtitle="Super-admin control panel." />
      <Banner tone="error" message={error.includes("Super admin") ? "This panel is for PubcoZone super-admins only." : error} />
    </div>
  );

  const shown = companies.filter((c) =>
    !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.ticker.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Feature Access" subtitle="Turn each IR-OS tool on or off per company. One click.">
        <Link href="/admin" className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">← Admin console</Link>
      </PageHeader>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Search company or ticker…"
        className="mb-4 w-full max-w-sm rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
      />

      <Card className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-app text-left text-xs text-faint">
                <th className="py-2 pr-4 font-medium">Company</th>
                {features.map((f) => (
                  <th key={f.key} className="px-2 py-2 text-center font-medium" title={f.label}>
                    <span className="block text-base">{f.icon}</span>
                    <span className="block text-[10px] leading-tight">{f.label.split(" ")[0]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-b border-app">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium text-app">{c.name}</span>
                    {c.ticker && <span className="ml-1.5 text-xs text-faint">${c.ticker}</span>}
                  </td>
                  {features.map((f) => {
                    const on = c.features[f.key];
                    const busy = saving === `${c.id}:${f.key}`;
                    return (
                      <td key={f.key} className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => toggle(c.id, f.key, !on)}
                          disabled={busy}
                          aria-label={`${on ? "Disable" : "Enable"} ${f.label} for ${c.name}`}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${on ? "bg-emerald-500" : "bg-slate-400/40"} ${busy ? "opacity-50" : ""}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={features.length + 1} className="py-8 text-center text-sm text-faint">No companies match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold text-app">Recent activity (audit log)</h2>
        {audit.length === 0 ? (
          <p className="text-sm text-faint">Nothing logged yet.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2 text-muted">
                <span className="shrink-0 text-xs text-faint">{a.createdAt?.slice(0, 16).replace("T", " ")}</span>
                <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400">{a.action}</span>
                {a.entityId && <span className="text-xs text-faint">{a.entityId}</span>}
                {a.actorEmail && <span className="ml-auto text-xs text-faint">{a.actorEmail}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

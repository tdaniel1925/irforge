"use client";

import { useEffect, useState } from "react";
import InlineConfirm from "./InlineConfirm";

interface Row {
  id: string; name: string; ticker: string; ownerEmail: string; tier: string;
  subscriptionStatus: string; comped: boolean; mrr: number; createdAt: string;
  archivedAt: string | null; postsTotal: number; lastActive: string | null; active30d: boolean;
}
interface Detail {
  id: string; name: string; ticker: string; ownerEmail: string; tier: string;
  subscriptionStatus: string; comped: boolean; mrr: number; createdAt: string; archivedAt: string | null;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  team: { email: string; role: string; status: string }[];
  connectedSocials: string[]; features: Record<string, boolean>;
  usage: { postsDrafted: number; postsPublished: number; postsScheduled: number; calendars: number; approvals: number; actions30d: number; lastActive: string | null };
  featureAdoption: string[];
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function ago(iso: string | null) {
  if (!iso) return "never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return d === 0 ? "today" : d === 1 ? "yesterday" : `${d}d ago`;
}

export default function CustomerConsole() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"active" | "comped" | "inactive" | "archived" | "all">("active");
  const [sort, setSort] = useState<"recent" | "mrr" | "activity" | "name">("recent");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/customers?archived=1`, { cache: "no-store" });
    const d = await res.json();
    if (res.ok) setRows(d.customers ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openDetail = async (id: string) => {
    setDrawerLoading(true); setDetail(null); setDelConfirm(""); setMsg("");
    const res = await fetch(`/api/admin/customers?id=${id}`, { cache: "no-store" });
    const d = await res.json();
    if (res.ok) setDetail(d.customer);
    setDrawerLoading(false);
  };

  const act = async (action: string, companyId: string, confirm?: string) => {
    setMsg("");
    const res = await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, companyId, confirm }) });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error ?? "Action failed."); return false; }
    await load();
    return true;
  };

  // Filter + sort.
  const visible = rows
    .filter((r) => {
      if (filter === "archived") return Boolean(r.archivedAt);
      if (r.archivedAt) return false;
      if (filter === "active") return r.subscriptionStatus === "active" && !r.comped;
      if (filter === "comped") return r.comped;
      if (filter === "inactive") return !r.active30d;
      return true;
    })
    .filter((r) => !q || `${r.name} ${r.ticker} ${r.ownerEmail}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      if (sort === "mrr") return b.mrr - a.mrr;
      if (sort === "activity") return (b.lastActive ?? "").localeCompare(a.lastActive ?? "");
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });

  const stats = rows.filter((r) => !r.archivedAt).reduce(
    (s, r) => {
      s.total++;
      if (r.comped) s.comped++;
      else if (r.subscriptionStatus === "active") { s.paying++; s.mrr += r.mrr; }
      if (!r.active30d) s.dormant++;
      return s;
    },
    { total: 0, paying: 0, comped: 0, dormant: 0, mrr: 0 }
  );

  return (
    <div className="mb-6">
      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Customers" value={stats.total} />
        <Stat label="Paying" value={stats.paying} />
        <Stat label="Comped" value={stats.comped} />
        <Stat label="Dormant (30d)" value={stats.dormant} tone={stats.dormant ? "warn" : undefined} />
        <Stat label="MRR" value={`$${stats.mrr.toLocaleString()}`} tone="good" />
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search name / ticker / email…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm">
          {["active", "comped", "inactive", "archived", "all"].map((f) => <option key={f} value={f}>{f === "inactive" ? "dormant" : f}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm">
          <option value="recent">Newest</option><option value="mrr">MRR</option><option value="activity">Last active</option><option value="name">Name</option>
        </select>
      </div>
      {msg && <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{msg}</p>}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr><th className="px-3 py-2">Company</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">MRR</th><th className="px-3 py-2">Posts</th><th className="px-3 py-2">Last active</th><th className="px-3 py-2"></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-6 text-center text-faint">Loading…</td></tr>}
            {!loading && visible.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-faint">No customers match.</td></tr>}
            {visible.map((r) => (
              <tr key={r.id} className={`border-t border-app hover:bg-app-hover ${r.archivedAt ? "opacity-50" : ""}`}>
                <td className="px-3 py-2.5">
                  <button onClick={() => openDetail(r.id)} className="text-left">
                    <span className="font-medium text-app">{r.name}</span> {r.ticker && <span className="text-xs text-faint">${r.ticker}</span>}
                    <span className="block text-xs text-faint">{r.ownerEmail || "no owner"}</span>
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${r.comped ? "bg-violet-500/15 text-violet-600" : r.subscriptionStatus === "active" ? "bg-emerald-500/15 text-emerald-600" : "bg-app/60 text-muted"}`}>
                    {r.comped ? "Comped" : r.subscriptionStatus}
                  </span>
                  <span className="ml-1 text-xs text-faint">{r.tier}</span>
                </td>
                <td className="px-3 py-2.5">{r.mrr ? `$${r.mrr.toLocaleString()}` : "—"}</td>
                <td className="px-3 py-2.5">{r.postsTotal}</td>
                <td className="px-3 py-2.5"><span className={r.active30d ? "text-app" : "text-faint"}>{ago(r.lastActive)}</span></td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => openDetail(r.id)} className="text-xs text-emerald-600">Details →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail drawer */}
      {(detail || drawerLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <div className="h-full w-full max-w-md overflow-y-auto border-l border-app bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {drawerLoading || !detail ? <p className="text-sm text-muted">Loading…</p> : (
              <>
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-app">{detail.name} {detail.ticker && <span className="text-sm text-faint">${detail.ticker}</span>}</h3>
                    <p className="text-xs text-faint">{detail.ownerEmail}</p>
                  </div>
                  <button onClick={() => setDetail(null)} className="text-muted hover:text-app">✕</button>
                </div>

                {/* Billing */}
                <Section title="Billing">
                  <KV k="Plan / status" v={`${detail.tier} · ${detail.comped ? "comped" : detail.subscriptionStatus}`} />
                  <KV k="MRR" v={detail.mrr ? `$${detail.mrr.toLocaleString()}/mo` : "$0"} />
                  <KV k="Signed up" v={fmtDate(detail.createdAt)} />
                  {detail.stripeCustomerId && <KV k="Stripe customer" v={<a className="text-emerald-600" target="_blank" rel="noopener noreferrer" href={`https://dashboard.stripe.com/customers/${detail.stripeCustomerId}`}>{detail.stripeCustomerId.slice(0, 18)}… ↗</a>} />}
                  {detail.archivedAt && <KV k="Archived" v={fmtDate(detail.archivedAt)} />}
                </Section>

                {/* Usage */}
                <Section title="Usage">
                  <div className="grid grid-cols-2 gap-2">
                    <Mini label="Drafted" value={detail.usage.postsDrafted} />
                    <Mini label="Published" value={detail.usage.postsPublished} />
                    <Mini label="Calendars" value={detail.usage.calendars} />
                    <Mini label="Approvals" value={detail.usage.approvals} />
                    <Mini label="Actions (30d)" value={detail.usage.actions30d} />
                    <Mini label="Last active" value={ago(detail.usage.lastActive)} />
                  </div>
                </Section>

                {/* Feature adoption */}
                <Section title="Tools used">
                  {detail.featureAdoption.length ? (
                    <div className="flex flex-wrap gap-1.5">{detail.featureAdoption.map((f) => <span key={f} className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600">{f}</span>)}</div>
                  ) : <p className="text-xs text-faint">No tool activity yet.</p>}
                </Section>

                {/* Team */}
                <Section title={`Team (${detail.team.length})`}>
                  <ul className="space-y-1">
                    {detail.team.map((t, i) => <li key={i} className="flex justify-between text-sm"><span className="text-app">{t.email}</span><span className="text-xs text-faint">{t.role} · {t.status}</span></li>)}
                    {!detail.team.length && <li className="text-xs text-faint">No team members.</li>}
                  </ul>
                </Section>

                {/* Connections */}
                <Section title="Socials">
                  {detail.connectedSocials.length ? <p className="text-sm text-app">{detail.connectedSocials.join(", ")}</p> : <p className="text-xs text-faint">No social profile linked.</p>}
                </Section>

                {msg && <p className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600">{msg}</p>}

                {/* Danger zone */}
                <Section title="Actions">
                  <div className="flex flex-wrap gap-2">
                    {detail.archivedAt ? (
                      <button onClick={async () => { if (await act("unarchive", detail.id)) openDetail(detail.id); }} className="rounded-lg border border-app px-3 py-1.5 text-sm">Unarchive</button>
                    ) : (
                      <InlineConfirm onConfirm={async () => { if (await act("archive", detail.id)) openDetail(detail.id); }} label="Archive" confirmLabel="Archive (revoke access)" className="rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-600" />
                    )}
                  </div>
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-600">Delete permanently — irreversible</p>
                    <p className="mt-1 text-xs text-muted">Type <b>{detail.name || detail.ticker}</b> to confirm.</p>
                    <div className="mt-2 flex gap-2">
                      <input value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="Company name" className="flex-1 rounded-lg border border-app bg-surface-2 px-2 py-1.5 text-sm text-app" />
                      <button
                        disabled={delConfirm.trim() !== (detail.name || detail.ticker).trim()}
                        onClick={async () => { if (await act("delete", detail.id, delConfirm)) { setDetail(null); } }}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                      >Delete</button>
                    </div>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-xl border border-app bg-surface p-3">
      <div className={`text-xl font-bold ${tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-app"}`}>{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mb-4"><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{title}</p>{children}</div>;
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between py-0.5 text-sm"><span className="text-muted">{k}</span><span className="text-app">{v}</span></div>;
}
function Mini({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-lg bg-app/40 px-2 py-1.5"><div className="text-base font-bold text-app">{value}</div><div className="text-[10px] text-faint">{label}</div></div>;
}

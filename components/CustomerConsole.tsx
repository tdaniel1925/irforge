"use client";

import { useEffect, useState } from "react";
import InlineConfirm from "./InlineConfirm";

interface Row {
  id: string; name: string; ticker: string; ownerEmail: string; tier: string;
  subscriptionStatus: string; comped: boolean; mrr: number; createdAt: string;
  archivedAt: string | null; postsTotal: number; lastActive: string | null; active30d: boolean;
  kind: "customer" | "prospect" | "phantom"; onboardingComplete: boolean;
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
  // kind drives the SERVER query: customer (paying/comped) | prospect (real but
  // unpaid). Phantom team-member companies are NOT customers — they live on the
  // Users page, so there's no "all" here that would leak them in.
  const [kind, setKind] = useState<"customer" | "prospect">("customer");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<"recent" | "mrr" | "activity" | "name">("recent");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [delConfirm, setDelConfirm] = useState("");
  const [msg, setMsg] = useState("");
  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Pagination
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    const p = new URLSearchParams({ kind, archived: showArchived ? "1" : "0" });
    const res = await fetch(`/api/admin/customers?${p}`, { cache: "no-store" });
    const d = await res.json();
    if (res.ok) setRows(d.customers ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, [kind, showArchived]);

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

  // Billing / lifecycle actions live on the OTHER admin route (/api/admin/customer,
  // singular). Ported from the old standalone Companies list so this console is the
  // single place to comp, invoice, or act-as a customer.
  const [actBusy, setActBusy] = useState("");
  const billing = async (body: object, okMsg: string) => {
    setActBusy(JSON.stringify(body)); setMsg("");
    try {
      const res = await fetch("/api/admin/customer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? "Action failed."); return null; }
      setMsg(d.invoiceUrl ? `Invoice ready: ${d.invoiceUrl}` : okMsg);
      await load();
      if (detail) await openDetail(detail.id);
      return d;
    } catch { setMsg("Network error."); return null; } finally { setActBusy(""); }
  };
  const impersonate = async (companyId: string) => {
    setMsg("");
    const res = await fetch("/api/admin/impersonate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
    if (res.ok) window.location.href = "/app";
    else setMsg("Couldn't start impersonation.");
  };

  // Bulk action over the selected ids. Delete needs a count-based typed confirm.
  const bulk = async (action: "archive" | "unarchive" | "delete") => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkBusy(true); setMsg("");
    try {
      const res = await fetch("/api/admin/customers", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids, confirm: action === "delete" ? bulkConfirm : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error ?? "Bulk action failed."); return; }
      setMsg(`${action === "delete" ? "Deleted" : action === "archive" ? "Archived" : "Unarchived"} ${d.ok}${d.failed?.length ? ` · ${d.failed.length} failed` : ""}.`);
      setSelected(new Set()); setBulkConfirm("");
      await load();
    } catch { setMsg("Network error."); } finally { setBulkBusy(false); }
  };

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Search + sort. Kind + archived are already applied server-side.
  const visible = rows
    .filter((r) => !q || `${r.name} ${r.ticker} ${r.ownerEmail}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      if (sort === "mrr") return b.mrr - a.mrr;
      if (sort === "activity") return (b.lastActive ?? "").localeCompare(a.lastActive ?? "");
      if (sort === "name") return a.name.localeCompare(b.name);
      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
    });

  // Client-side pagination over the filtered/sorted set. Reset to page 1 whenever
  // the result set changes so we never sit on an out-of-range page.
  useEffect(() => { setPage(0); }, [q, kind, showArchived, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = visible.slice(safePage * pageSize, safePage * pageSize + pageSize);

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

      {/* Kind segment — Customers (paying/comped) · Prospects. Phantom
          team-member companies are NOT here; they live on the Users page. */}
      <div className="mb-3 inline-flex rounded-lg border border-app bg-surface-2 p-0.5 text-sm">
        {([["customer", "Customers"], ["prospect", "Prospects"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 font-medium transition ${kind === k ? "bg-emerald-600 text-white" : "text-muted hover:text-app"}`}>{label}</button>
        ))}
      </div>

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search name / ticker / email…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <label className="flex items-center gap-1.5 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="h-4 w-4" /> Archived</label>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm">
          <option value="recent">Newest</option><option value="mrr">MRR</option><option value="activity">Last active</option><option value="name">Name</option>
        </select>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm" aria-label="Per page">
          <option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option>
        </select>
      </div>
      {msg && <p className="mb-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{msg}</p>}

      {/* Bulk action bar — appears when rows are selected */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2">
          <span className="text-sm font-semibold text-app">{selected.size} selected</span>
          <button onClick={() => bulk("archive")} disabled={bulkBusy} className="rounded-lg border border-amber-400/50 bg-amber-500/10 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 disabled:opacity-40">Archive selected</button>
          <button onClick={() => bulk("unarchive")} disabled={bulkBusy} className="rounded-lg border border-app px-3 py-1.5 text-sm font-semibold text-app hover:bg-app-hover disabled:opacity-40">Unarchive</button>
          <div className="ml-auto flex items-center gap-2">
            <input value={bulkConfirm} onChange={(e) => setBulkConfirm(e.target.value)} placeholder={`type "delete ${selected.size}"`} className="w-40 rounded-lg border border-red-500/30 bg-surface-2 px-2 py-1.5 text-xs text-app focus:outline-none" />
            <button onClick={() => bulk("delete")} disabled={bulkBusy || bulkConfirm.trim().toLowerCase() !== `delete ${selected.size}`} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-300 disabled:opacity-40">{bulkBusy ? "…" : "Delete selected"}</button>
            <button onClick={() => { setSelected(new Set()); setBulkConfirm(""); }} className="text-xs text-faint hover:text-app">Clear</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-faint">
            <tr>
              <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Select all on this page" checked={paged.length > 0 && paged.every((r) => selected.has(r.id))} onChange={(e) => setSelected((prev) => { const n = new Set(prev); paged.forEach((r) => e.target.checked ? n.add(r.id) : n.delete(r.id)); return n; })} className="h-4 w-4" /></th>
              <th className="px-3 py-2">Company</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">MRR</th><th className="px-3 py-2">Posts</th><th className="px-3 py-2">Last active</th><th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-6 text-center text-faint">Loading…</td></tr>}
            {!loading && visible.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-faint">No customers match.</td></tr>}
            {paged.map((r) => (
              <tr key={r.id} className={`border-t border-app hover:bg-app-hover ${r.archivedAt ? "opacity-50" : ""} ${selected.has(r.id) ? "bg-emerald-500/[0.04]" : ""}`}>
                <td className="px-3 py-2.5"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4" /></td>
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

      {/* Pagination */}
      {visible.length > pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-faint">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, visible.length)} of {visible.length}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">← Prev</button>
            <span className="px-1 py-1.5 text-muted">Page {safePage + 1} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}

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

                {/* Billing / lifecycle */}
                <Section title="Billing & access">
                  <div className="flex flex-wrap gap-2">
                    {detail.subscriptionStatus !== "active" && (
                      <>
                        <button disabled={!!actBusy} onClick={() => billing({ action: "comp", companyId: detail.id, tier: detail.tier }, `${detail.name} comped to active.`)} className="rounded-lg border border-app px-3 py-1.5 text-sm text-app hover:bg-app-hover disabled:opacity-40">Comp</button>
                        <button disabled={!!actBusy} onClick={() => billing({ action: "comp_full", companyId: detail.id }, `${detail.name} now has everything free.`)} className="rounded-lg border border-emerald-400/50 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300 disabled:opacity-40">🎁 Comp full (free)</button>
                        {detail.stripeCustomerId && (
                          <button disabled={!!actBusy} onClick={() => billing({ action: "send_subscription_invoice", customerId: detail.stripeCustomerId, companyId: detail.id, tier: detail.tier }, "Subscription invoice created.")} className="rounded-lg border border-app px-3 py-1.5 text-sm text-app hover:bg-app-hover disabled:opacity-40">Send invoice</button>
                        )}
                      </>
                    )}
                    <button onClick={() => impersonate(detail.id)} className="rounded-lg border border-app px-3 py-1.5 text-sm text-app hover:bg-app-hover" title="Log in as this company">👁 Act as</button>
                    {detail.stripeSubscriptionId && (
                      <InlineConfirm onConfirm={() => billing({ action: "cancel_sub", subscriptionId: detail.stripeSubscriptionId, companyId: detail.id }, "Subscription canceled.")} label="Cancel subscription" confirmLabel="Confirm cancel" className="rounded-lg border border-red-400/40 px-3 py-1.5 text-sm text-red-600 dark:text-red-300" />
                    )}
                  </div>
                </Section>

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

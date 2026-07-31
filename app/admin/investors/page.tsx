"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Banner, LoadingState, PageHeader, timeAgo, type Notice } from "@/components/ui";
import { SoftCard, SectionLabel } from "@/components/admin/ui";
import InlineConfirm from "@/components/InlineConfirm";

interface Investor {
  id: string; userId: string; handle: string; displayName: string; email: string; bio: string;
  plan: string; subscriptionStatus: string; profileComplete: boolean; suspended: boolean; suspendedReason: string; createdAt: string;
}
interface Detail extends Investor {
  posts: { id: string; ticker: string; body: string; flag: string; ts: string }[];
  watches: { ticker: string; ts: string }[];
  questionCount: number;
}


export default function AdminInvestors() {
  const [rows, setRows] = useState<Investor[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState("all");
  const [status, setStatus] = useState("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const [open, setOpen] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ search, plan, status, limit: String(pageSize), offset: String(page * pageSize) });
      const res = await fetch(`/api/admin/investors?${p}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed."); return; }
      setRows(d.rows); setTotal(d.total); setError(null);
    } catch { setError("Network error."); } finally { setLoading(false); }
  }, [search, plan, status, pageSize, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, plan, status, pageSize]);

  const openDetail = async (id: string) => {
    setOpen(null); setBusy(true);
    try {
      const res = await fetch(`/api/admin/investors?id=${id}`);
      const d = await res.json();
      if (res.ok) setOpen(d.investor);
    } finally { setBusy(false); }
  };

  const act = async (body: object, okMsg: string) => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/admin/investors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice({ text: d.error ?? "Action failed.", tone: "error" }); return false; }
      setNotice({ text: okMsg, tone: "success" });
      await load();
      return true;
    } catch { setNotice({ text: "Network error.", tone: "error" }); return false; } finally { setBusy(false); }
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const planPill = (p: string) => p === "member_plus"
    ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">Member+</span>
    : <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Free</span>;

  return (
    <div>
      <PageHeader title="Investor accounts" subtitle="View, search, and manage every investor on the platform. Admins only.">
        <Link href="/admin" className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-app-hover">← Admin console</Link>
      </PageHeader>

      {notice && <Banner tone={notice.tone} message={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search handle, name, or email…" className="flex-1 min-w-52 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <select value={plan} onChange={(e) => setPlan(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none">
          <option value="all">All plans</option><option value="free">Free</option><option value="member_plus">Member+</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none">
          <option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" aria-label="Per page">
          <option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option>
        </select>
      </div>

      {error && <Banner tone="error" message={error} />}
      {loading ? <LoadingState /> : (
        <SoftCard className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app text-left text-xs text-faint">
              <th className="px-4 py-3 font-medium">Investor</th><th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Plan</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-app hover:bg-app-hover/40">
                  <td className="px-4 py-3">
                    <span className="font-medium text-app">@{r.handle}</span>
                    {r.displayName && <span className="block text-xs text-faint">{r.displayName}</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.email || <span className="text-faint">—</span>}</td>
                  <td className="px-4 py-3">{planPill(r.plan)}</td>
                  <td className="px-4 py-3">{r.suspended
                    ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300">Suspended</span>
                    : <span className="text-emerald-600 dark:text-emerald-400 text-xs">Active</span>}</td>
                  <td className="px-4 py-3 text-faint">{r.createdAt ? timeAgo(r.createdAt) : "—"}</td>
                  <td className="px-4 py-3 text-right"><button onClick={() => openDetail(r.id)} className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Manage →</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-faint">No investors match.</td></tr>}
            </tbody>
          </table>
        </SoftCard>
      )}

      {total > pageSize && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-faint">{page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">← Prev</button>
            <span className="px-1 py-1.5 text-muted">Page {page + 1} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setOpen(null)}>
          <div className="h-full w-full max-w-lg overflow-y-auto bg-surface p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-app">@{open.handle}</h2>
                {open.displayName && <p className="text-sm text-muted">{open.displayName}</p>}
                <p className="text-xs text-faint">{open.email}</p>
              </div>
              <button onClick={() => setOpen(null)} className="text-faint hover:text-app">✕</button>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {planPill(open.plan)}
              {open.suspended && <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-300">Suspended</span>}
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">{open.subscriptionStatus}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Joined {open.createdAt.slice(0, 10)}</span>
            </div>

            {open.bio && <p className="mb-4 rounded-lg bg-surface-2 p-3 text-sm text-muted">{open.bio}</p>}

            {/* Actions */}
            <SectionLabel>Manage</SectionLabel>
            <div className="mb-5 flex flex-wrap gap-2">
              {open.suspended
                ? <button disabled={busy} onClick={() => act({ action: "unsuspend", id: open.id }, "Account un-suspended.").then((ok) => ok && setOpen(null))} className="rounded-lg border border-app px-3 py-2 text-sm font-semibold text-app hover:bg-app-hover disabled:opacity-40">Un-suspend</button>
                : <button disabled={busy} onClick={() => act({ action: "suspend", id: open.id }, "Account suspended.").then((ok) => ok && setOpen(null))} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-500/20 dark:text-amber-300 disabled:opacity-40">Suspend</button>}
              <button disabled={busy} onClick={() => act({ action: "setPlan", id: open.id, plan: open.plan === "member_plus" ? "free" : "member_plus" }, "Plan updated.").then((ok) => ok && setOpen(null))} className="rounded-lg border border-app px-3 py-2 text-sm font-semibold text-app hover:bg-app-hover disabled:opacity-40">
                {open.plan === "member_plus" ? "Downgrade to Free" : "Grant Member+"}
              </button>
              <div className="ml-auto">
                <InlineConfirm onConfirm={() => act({ action: "delete", id: open.id, confirm: true }, "Account deleted.").then((ok) => ok && setOpen(null))} label="Delete account" confirmLabel="Confirm delete" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-500/20 dark:text-red-300" />
              </div>
            </div>

            {/* Activity */}
            <SectionLabel>Activity</SectionLabel>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-lg font-bold text-app">{open.posts.length}</p><p className="text-[11px] text-faint">posts</p></div>
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-lg font-bold text-app">{open.questionCount}</p><p className="text-[11px] text-faint">questions</p></div>
              <div className="rounded-lg bg-surface-2 p-2"><p className="text-lg font-bold text-app">{open.watches.length}</p><p className="text-[11px] text-faint">watchlist</p></div>
            </div>
            {open.watches.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {open.watches.slice(0, 20).map((w) => <span key={w.ticker} className="rounded-full border border-app px-2 py-0.5 text-[11px] text-muted">${w.ticker}</span>)}
              </div>
            )}
            <div className="space-y-2">
              {open.posts.slice(0, 15).map((p) => (
                <div key={p.id} className="rounded-lg border border-app p-2.5">
                  <p className="text-[11px] text-faint">${p.ticker} · {p.flag} · {p.ts.slice(0, 10)}</p>
                  <p className="text-sm text-app">{p.body.slice(0, 200)}</p>
                </div>
              ))}
              {open.posts.length === 0 && <p className="py-4 text-center text-xs text-faint">No board activity.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

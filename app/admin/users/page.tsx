"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Banner, LoadingState, PageHeader } from "@/components/ui";
import { SoftCard, SectionLabel, MetricTile } from "@/components/admin/ui";
import InlineConfirm from "@/components/InlineConfirm";

interface AdminUser {
  userId: string; email: string; kind: "company_member" | "investor" | "unlinked";
  companyId: string | null; companyName: string | null; companyTicker: string | null;
  role: string | null; membershipStatus: string | null; handle: string | null; createdAt: string;
}
interface Group { companyId: string; companyName: string; companyTicker: string; count: number; users: AdminUser[] }
interface Data { users: AdminUser[]; byCompany: Group[]; counts: { total: number; companyMembers: number; investors: number; unlinked: number } }

export default function AdminUsers() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grouped" | "flat">("grouped");
  const [tab, setTab] = useState<"all" | "company_member" | "investor" | "unlinked">("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  // Link-to-company
  const [companies, setCompanies] = useState<{ id: string; name: string; ticker: string }[]>([]);
  const [linkingUser, setLinkingUser] = useState<AdminUser | null>(null);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkRole, setLinkRole] = useState<"member" | "admin">("member");
  const [linkBusy, setLinkBusy] = useState(false);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(search ? { search } : {});
      const res = await fetch(`/api/admin/users?${p}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Failed."); return; }
      setData(d); setError(null);
    } catch { setError("Network error."); } finally { setLoading(false); }
  }, [search]);
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t); }, [load, search]);

  // Load the linkable-company list once (for the picker).
  useEffect(() => {
    fetch("/api/admin/users?companies=1").then((r) => r.json()).then((d) => setCompanies(d.companies ?? [])).catch(() => {});
  }, []);

  const doLink = async (userId: string, companyId: string) => {
    setLinkBusy(true); setNotice("");
    try {
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", userId, companyId, role: linkRole }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(d.error ?? "Couldn't link."); return; }
      setNotice("Linked to company."); setLinkingUser(null); setLinkSearch("");
      await load();
    } catch { setNotice("Network error."); } finally { setLinkBusy(false); }
  };
  const doUnlink = async (userId: string, companyId: string) => {
    setLinkBusy(true); setNotice("");
    try {
      const res = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlink", userId, companyId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(d.error ?? "Couldn't unlink."); return; }
      setNotice("Removed from company."); await load();
    } catch { setNotice("Network error."); } finally { setLinkBusy(false); }
  };

  const kindPill = (u: AdminUser) => {
    if (u.kind === "investor") return <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-300">Investor</span>;
    if (u.kind === "unlinked") return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-faint">Unlinked</span>;
    return <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${u.role === "admin" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-violet-500/15 text-violet-700 dark:text-violet-300"}`}>{u.role === "admin" ? "Company admin" : "Company member"}</span>;
  };
  const statusChip = (u: AdminUser) => u.membershipStatus === "invited"
    ? <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">Invited</span> : null;

  const flatRows = (data?.users ?? []).filter((u) => tab === "all" || u.kind === tab);

  // Pagination — the flat list paginates ROWS; the grouped view paginates
  // COMPANY GROUPS (one page = N companies). Reset to page 1 when the set changes.
  useEffect(() => { setPage(0); }, [view, tab, search, pageSize]);
  const groups = data?.byCompany ?? [];
  const pageItemsTotal = view === "flat" ? flatRows.length : groups.length;
  const pageCount = Math.max(1, Math.ceil(pageItemsTotal / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pagedFlat = flatRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const pagedGroups = groups.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const Pager = () => pageItemsTotal <= pageSize ? null : (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-faint">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, pageItemsTotal)} of {pageItemsTotal} {view === "flat" ? "users" : "companies"}</span>
      <div className="flex gap-2">
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">← Prev</button>
        <span className="px-1 py-1.5 text-muted">Page {safePage + 1} / {pageCount}</span>
        <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-app px-3 py-1.5 text-app hover:bg-app-hover disabled:opacity-40">Next →</button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Users" subtitle="Every person on the platform, classified by the account they belong to. Company teammates are grouped under their company; investors are separate.">
        <Link href="/admin" className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-app-hover">← Admin console</Link>
      </PageHeader>

      {error && <Banner tone="error" message={error} />}
      {notice && <Banner tone="success" message={notice} onDismiss={() => setNotice("")} />}

      {/* Link-to-company picker */}
      {linkingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setLinkingUser(null)}>
          <div className="w-full max-w-md rounded-2xl border border-app bg-surface p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-app">Link {linkingUser.email} to a company</h3>
            <p className="mt-1 text-xs text-muted">Adds them as an active teammate and removes any empty placeholder company they own.</p>
            <div className="mt-3 flex gap-2">
              <input autoFocus value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="Search company…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
              <select value={linkRole} onChange={(e) => setLinkRole(e.target.value as "member" | "admin")} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm text-app">
                <option value="member">Member</option><option value="admin">Admin</option>
              </select>
            </div>
            <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {companies.filter((c) => !linkSearch || `${c.name} ${c.ticker}`.toLowerCase().includes(linkSearch.toLowerCase())).slice(0, 50).map((c) => (
                <button key={c.id} disabled={linkBusy} onClick={() => doLink(linkingUser.userId, c.id)} className="flex w-full items-center justify-between rounded-lg border border-app px-3 py-2 text-left text-sm hover:bg-app-hover disabled:opacity-40">
                  <span className="text-app">{c.name} {c.ticker && <span className="text-faint">${c.ticker}</span>}</span>
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Link →</span>
                </button>
              ))}
              {companies.length === 0 && <p className="py-3 text-center text-xs text-faint">No companies to link to.</p>}
            </div>
            <button onClick={() => setLinkingUser(null)} className="mt-3 text-sm text-faint hover:text-app">Cancel</button>
          </div>
        </div>
      )}

      {data && (
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricTile label="Total users" value={data.counts.total} />
          <MetricTile label="Company teammates" value={data.counts.companyMembers} />
          <MetricTile label="Investors" value={data.counts.investors} />
          <MetricTile label="Unlinked" value={data.counts.unlinked} />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search email, handle, or company…" className="flex-1 min-w-52 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <div className="inline-flex rounded-lg border border-app bg-surface-2 p-0.5 text-sm">
          {([["grouped", "By company"], ["flat", "Flat list"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium transition ${view === v ? "bg-emerald-600 text-white" : "text-muted hover:text-app"}`}>{label}</button>
          ))}
        </div>
        <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm" aria-label="Per page">
          <option value={25}>25 / page</option><option value={50}>50 / page</option><option value={100}>100 / page</option>
        </select>
      </div>

      {loading ? <LoadingState /> : !data ? null : view === "grouped" ? (
        <div className="space-y-4">
          {pagedGroups.map((g) => (
            <SoftCard key={g.companyId}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-app">{g.companyName} {g.companyTicker && <span className="text-faint">${g.companyTicker}</span>}</h3>
                <span className="text-xs text-faint">{g.count} teammate{g.count === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-app">
                {g.users.map((u, i) => (
                  <div key={u.userId || u.email || i} className="flex items-center justify-between py-2">
                    <span className="text-sm text-app">{u.email}{statusChip(u)}</span>
                    {kindPill(u)}
                  </div>
                ))}
              </div>
            </SoftCard>
          ))}
          {data.byCompany.length === 0 && <SoftCard><p className="py-6 text-center text-sm text-faint">No company teammates match.</p></SoftCard>}
          <Pager />

          {data.counts.investors > 0 && (
            <>
              <SectionLabel>Investors ({data.counts.investors})</SectionLabel>
              <SoftCard>
                <div className="divide-y divide-app">
                  {data.users.filter((u) => u.kind === "investor").map((u) => (
                    <div key={u.userId} className="flex items-center justify-between py-2">
                      <span className="text-sm text-app">{u.handle ? `@${u.handle}` : u.email} {u.handle && <span className="text-xs text-faint">· {u.email}</span>}</span>
                      {kindPill(u)}
                    </div>
                  ))}
                </div>
              </SoftCard>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 inline-flex rounded-lg border border-app bg-surface-2 p-0.5 text-sm">
            {([["all", "All"], ["company_member", "Teammates"], ["investor", "Investors"], ["unlinked", "Unlinked"]] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 font-medium transition ${tab === t ? "bg-emerald-600 text-white" : "text-muted hover:text-app"}`}>{label}</button>
            ))}
          </div>
          <SoftCard className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-app text-left text-xs text-faint">
                <th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Company</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {pagedFlat.map((u, i) => (
                  <tr key={u.userId || u.email || i} className="border-b border-app">
                    <td className="px-4 py-2.5 text-app">{u.handle ? `@${u.handle}` : u.email}{u.handle && <span className="block text-xs text-faint">{u.email}</span>}{statusChip(u)}</td>
                    <td className="px-4 py-2.5">{kindPill(u)}</td>
                    <td className="px-4 py-2.5 text-muted">{u.companyName ? <>{u.companyName}{u.companyTicker && <span className="text-faint"> ${u.companyTicker}</span>}</> : <span className="text-faint">—</span>}</td>
                    <td className="px-4 py-2.5 text-faint">{u.createdAt ? u.createdAt.slice(0, 10) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {/* Investors have no company link; only company/unlinked users do. */}
                      {u.kind !== "investor" && u.userId && (
                        u.kind === "company_member" && u.companyId
                          ? <InlineConfirm onConfirm={() => doUnlink(u.userId, u.companyId!)} label="Unlink" confirmLabel="Remove" className="text-xs text-faint hover:text-red-500" />
                          : <button onClick={() => { setLinkingUser(u); setLinkRole("member"); }} className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Link to company →</button>
                      )}
                    </td>
                  </tr>
                ))}
                {flatRows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-faint">No users match.</td></tr>}
              </tbody>
            </table>
          </SoftCard>
          <Pager />
        </>
      )}
    </div>
  );
}

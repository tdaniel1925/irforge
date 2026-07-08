"use client";

import { useState, useEffect } from "react";
import InlineConfirm from "./InlineConfirm";

// ── shared types (mirror lib/crm.ts) ──
interface Contact { id: string; crmCompanyId: string | null; companyName: string; fullName: string; title: string; email: string; phone: string; category: string; stage: string; topics: string[]; aum: string; sharesHeld: number | null; optedIn: boolean; peersHeld: string[]; notes: string; nextFollowup: string | null; lastTouchAt: string | null; ownerEmail?: string }

// Category values are stored lowercase (back-compat); shown Title Case in the UI.
const catLabel = (c: string) => c.charAt(0).toUpperCase() + c.slice(1);
interface Company { id: string; name: string; type: string; industry: string; website: string; notes: string; ownerEmail?: string }
interface Deal { id: string; title: string; stage: string; value: number; currency: string; contactId: string | null; crmCompanyId: string | null; closeDate: string | null; status: string; notes: string; ownerEmail?: string }
interface Task { id: string; title: string; dueDate: string | null; done: boolean; contactId: string | null; dealId?: string | null; ownerEmail?: string }
interface Metrics { contacts: number; openDeals: number; pipelineValue: number; wonValue: number; wonCount: number; lostCount: number; activities7d: number; tasksDue: number; dealsByStage: Record<string, { count: number; value: number }> }

const DEAL_STAGES = ["lead", "qualified", "meeting", "proposal", "won", "lost"];
const CONTACT_CATS = ["investor", "analyst", "journalist", "partner", "procurement", "talent", "shareholder", "other"];

const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n}`);

async function api(body: object) {
  const res = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed.");
  return res.json();
}

export default function CrmWorkspace({ initialContacts, initialCompanies, initialDeals, initialTasks, metrics, currentUserEmail = "" }: {
  initialContacts: Contact[]; initialCompanies: Company[]; initialDeals: Deal[]; initialTasks: Task[]; metrics: Metrics; currentUserEmail?: string;
}) {
  const [tab, setTab] = useState("dashboard");
  const [scope, setScope] = useState<"team" | "mine">("team");
  const [contacts, setContacts] = useState(initialContacts);
  const [companies, setCompanies] = useState(initialCompanies);
  const [deals, setDeals] = useState(initialDeals);
  const [tasks, setTasks] = useState(initialTasks);

  // Scope filter shared by the tab counts AND the rendered tabs, so "Mine" is consistent.
  const me = currentUserEmail.toLowerCase();
  const mine = <T extends { ownerEmail?: string }>(arr: T[]) => scope === "mine" && me ? arr.filter((x) => (x.ownerEmail ?? "").toLowerCase() === me) : arr;
  const sContacts = mine(contacts), sCompanies = mine(companies), sDeals = mine(deals), sTasks = mine(tasks);

  const TABS = [
    { k: "dashboard", label: "📊 Dashboard" },
    { k: "contacts", label: `👤 Contacts (${sContacts.length})` },
    { k: "companies", label: `🏢 Companies (${sCompanies.length})` },
    { k: "deals", label: `💼 Deals (${sDeals.filter((d) => d.status === "open").length})` },
    { k: "tasks", label: `✅ Tasks (${sTasks.filter((t) => !t.done).length})` },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === t.k ? "bg-emerald-600 text-white" : "border border-app text-muted hover:text-app"}`}>{t.label}</button>
        ))}
        {currentUserEmail && tab !== "dashboard" && (
          <div className="ml-auto flex overflow-hidden rounded-lg border border-app text-xs font-semibold">
            <button onClick={() => setScope("team")} className={`px-3 py-1.5 transition ${scope === "team" ? "bg-emerald-600 text-white" : "text-muted hover:text-app"}`}>Team</button>
            <button onClick={() => setScope("mine")} className={`px-3 py-1.5 transition ${scope === "mine" ? "bg-emerald-600 text-white" : "text-muted hover:text-app"}`}>Mine</button>
          </div>
        )}
        <a href="/investors" className={`rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-app hover:bg-app-hover ${currentUserEmail && tab !== "dashboard" ? "" : "ml-auto"}`}>🎯 Find investors</a>
        <a href="/crm/import" className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-app hover:bg-app-hover">⤓ Import / Export</a>
      </div>

      {tab === "dashboard" && <Dashboard metrics={metrics} deals={deals} tasks={tasks} />}
      {tab === "contacts" && <Contacts contacts={sContacts} setContacts={setContacts} companies={companies} />}
      {tab === "companies" && <Companies companies={sCompanies} setCompanies={setCompanies} />}
      {tab === "deals" && <Deals deals={sDeals} setDeals={setDeals} contacts={contacts} />}
      {tab === "tasks" && <Tasks tasks={sTasks} setTasks={setTasks} contacts={contacts} />}
    </div>
  );
}

// ───────────────────────────── Dashboard ─────────────────────────────
function Dashboard({ metrics: m, deals, tasks }: { metrics: Metrics; deals: Deal[]; tasks: Task[] }) {
  const stat = (label: string, val: string | number) => (
    <div className="rounded-xl border border-app bg-surface p-4"><p className="text-xs text-faint">{label}</p><p className="mt-1 text-2xl font-bold text-app">{val}</p></div>
  );
  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stat("Open pipeline", money(m.pipelineValue))}
        {stat("Open deals", m.openDeals)}
        {stat("Won", `${money(m.wonValue)} · ${m.wonCount}`)}
        {stat("Tasks due", m.tasksDue)}
        {stat("Contacts", m.contacts)}
        {stat("Activities (7d)", m.activities7d)}
        {stat("Lost deals", m.lostCount)}
        {stat("Win rate", m.wonCount + m.lostCount > 0 ? `${Math.round((m.wonCount / (m.wonCount + m.lostCount)) * 100)}%` : "—")}
      </div>
      <div className="mt-5 rounded-xl border border-app bg-surface p-4">
        <h3 className="mb-3 font-semibold text-app">Pipeline by stage</h3>
        <div className="space-y-2">
          {DEAL_STAGES.filter((s) => s !== "lost").map((s) => {
            const d = m.dealsByStage[s] ?? { count: 0, value: 0 };
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="w-20 text-xs capitalize text-muted">{s}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, d.count * 15)}%` }} /></div>
                <span className="w-24 text-right text-xs text-app">{d.count} · {money(d.value)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Contacts ─────────────────────────────
function Contacts({ contacts, setContacts, companies }: { contacts: Contact[]; setContacts: (f: (c: Contact[]) => Contact[]) => void; companies: Company[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<Partial<Contact> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    if (!editing?.fullName?.trim()) return;
    setBusy(true); setErr("");
    try {
      const d = await api({ entity: "contact", action: "save", data: editing });
      setContacts((cs) => { const ex = cs.some((c) => c.id === d.contact.id); return ex ? cs.map((c) => c.id === d.contact.id ? d.contact : c) : [d.contact, ...cs]; });
      setEditing(null);
    } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save that contact."); } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    setErr("");
    try { await api({ entity: "contact", action: "delete", id }); setContacts((cs) => cs.filter((c) => c.id !== id)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete that contact."); }
  };

  const compNameOf = (c: Contact) => c.companyName || companies.find((co) => co.id === c.crmCompanyId)?.name || "";

  // Sort — click a column header to sort; click again to flip direction.
  type SortKey = "fullName" | "company" | "category" | "email" | "sharesHeld";
  const [sortKey, setSortKey] = useState<SortKey>("fullName");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(1); }
  };
  const sortVal = (c: Contact): string | number => {
    switch (sortKey) {
      case "company": return compNameOf(c).toLowerCase();
      case "category": return c.category.toLowerCase();
      case "email": return c.email.toLowerCase();
      case "sharesHeld": return c.sharesHeld ?? -1; // blanks sort last ascending
      default: return c.fullName.toLowerCase();
    }
  };

  const filtered = contacts.filter((c) => (!q || `${c.fullName} ${c.email} ${c.title} ${c.phone} ${compNameOf(c)}`.toLowerCase().includes(q.toLowerCase())) && (!cat || c.category === cat));
  const shown = [...filtered].sort((a, b) => {
    const av = sortVal(a), bv = sortVal(b);
    if (av < bv) return -1 * sortDir;
    if (av > bv) return 1 * sortDir;
    return 0;
  });

  // Pagination — imported lists can be thousands of rows; render a page at a time.
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  // Reset to page 1 whenever the filter/search/sort changes the set.
  useEffect(() => { setPage(0); }, [q, cat, sortKey, sortDir]);
  // Clickable sort header cell.
  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-3 py-2 hover:text-app" onClick={() => toggleSort(k)}>
      {children}{sortKey === k && <span className="ml-0.5">{sortDir === 1 ? "▲" : "▼"}</span>}
    </th>
  );

  if (editing) {
    return (
      <RecordForm title={editing.id ? "Edit contact" : "New contact"} onSave={save} onCancel={() => setEditing(null)} busy={busy} canSave={!!editing.fullName?.trim()}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Inp label="Full name" v={editing.fullName ?? ""} on={(v) => setEditing({ ...editing, fullName: v })} />
          <Inp label="Title" v={editing.title ?? ""} on={(v) => setEditing({ ...editing, title: v })} />
          <Inp label="Email" v={editing.email ?? ""} on={(v) => setEditing({ ...editing, email: v })} />
          <Inp label="Phone" v={editing.phone ?? ""} on={(v) => setEditing({ ...editing, phone: v })} />
          <Sel label="Category" v={editing.category ?? "investor"} opts={CONTACT_CATS} labels={CONTACT_CATS.map(catLabel)} on={(v) => setEditing({ ...editing, category: v })} />
          <Inp label="Company" v={editing.companyName ?? ""} on={(v) => setEditing({ ...editing, companyName: v })} />
          <Inp label="AUM (funds)" v={editing.aum ?? ""} on={(v) => setEditing({ ...editing, aum: v })} />
          <Inp label="Shares held" type="number" v={editing.sharesHeld != null ? String(editing.sharesHeld) : ""} on={(v) => setEditing({ ...editing, sharesHeld: v.trim() === "" ? null : Number(v) })} />
          <Inp label="Next follow-up" type="date" v={editing.nextFollowup ?? ""} on={(v) => setEditing({ ...editing, nextFollowup: v })} />
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-app">
          <input type="checkbox" checked={!!editing.optedIn} onChange={(e) => setEditing({ ...editing, optedIn: e.target.checked })} className="h-4 w-4" />
          Opted in to updates
        </label>
        <Inp label="Notes" textarea v={editing.notes ?? ""} on={(v) => setEditing({ ...editing, notes: v })} />
      </RecordForm>
    );
  }

  return (
    <div>
      {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search contacts…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none"><option value="">All categories</option>{CONTACT_CATS.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}</select>
        <button onClick={() => setEditing({ category: "investor" })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-app bg-surface text-left text-xs text-faint"><Th k="fullName">Name</Th><Th k="company">Company</Th><Th k="category">Category</Th><Th k="email">Email</Th><th className="px-3 py-2">Phone</th><th className="px-3 py-2">AUM</th><Th k="sharesHeld">Shares</Th><th className="px-3 py-2">Updates</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {pageRows.map((c) => (
              <tr key={c.id} className="border-b border-app bg-surface">
                <td className="px-3 py-2.5"><span className="font-medium text-app">{c.fullName}</span>{c.title && <span className="block text-xs text-faint">{c.title}</span>}</td>
                <td className="px-3 py-2.5 text-muted">{compNameOf(c) || <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5"><span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{catLabel(c.category)}</span></td>
                <td className="px-3 py-2.5 text-muted">{c.email || <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-muted">{c.phone ? <a href={`tel:${c.phone}`} className="hover:text-app">{c.phone}</a> : <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-muted">{c.aum || <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-muted">{c.sharesHeld != null ? c.sharesHeld.toLocaleString() : <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5">{c.optedIn ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">✓ Opted in</span> : <span className="text-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => setEditing(c)} className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">Edit</button> <span className="ml-2 inline-block"><InlineConfirm onConfirm={() => del(c.id)} label="Del" confirmLabel="Delete" className="text-xs text-faint hover:text-red-500" /></span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-faint">No contacts. Add one or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>
      {shown.length > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-faint">
            {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, shown.length)} of {shown.length}
          </span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-lg border border-app px-3 py-1.5 text-app transition hover:bg-app-hover disabled:opacity-40">← Prev</button>
            <span className="px-1 py-1.5 text-muted">Page {safePage + 1} / {pageCount}</span>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-app px-3 py-1.5 text-app transition hover:bg-app-hover disabled:opacity-40">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Companies ─────────────────────────────
function Companies({ companies, setCompanies }: { companies: Company[]; setCompanies: (f: (c: Company[]) => Company[]) => void }) {
  const [editing, setEditing] = useState<Partial<Company> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!editing?.name?.trim()) return;
    setBusy(true); setErr("");
    try { const d = await api({ entity: "company", action: "save", data: editing }); setCompanies((cs) => { const ex = cs.some((c) => c.id === d.company.id); return ex ? cs.map((c) => c.id === d.company.id ? d.company : c) : [d.company, ...cs]; }); setEditing(null); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save that company."); } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    setErr("");
    try { await api({ entity: "company", action: "delete", id }); setCompanies((cs) => cs.filter((c) => c.id !== id)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete that company."); }
  };

  if (editing) {
    return (
      <RecordForm title={editing.id ? "Edit company" : "New company"} onSave={save} onCancel={() => setEditing(null)} busy={busy} canSave={!!editing.name?.trim()}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Inp label="Name" v={editing.name ?? ""} on={(v) => setEditing({ ...editing, name: v })} />
          <Sel label="Type" v={editing.type ?? "other"} opts={["fund", "analyst_firm", "media", "partner", "vendor", "other"]} on={(v) => setEditing({ ...editing, type: v })} />
          <Inp label="Industry" v={editing.industry ?? ""} on={(v) => setEditing({ ...editing, industry: v })} />
          <Inp label="Website" v={editing.website ?? ""} on={(v) => setEditing({ ...editing, website: v })} />
        </div>
        <Inp label="Notes" textarea v={editing.notes ?? ""} on={(v) => setEditing({ ...editing, notes: v })} />
      </RecordForm>
    );
  }
  return (
    <div>
      {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <button onClick={() => setEditing({ type: "fund" })} className="mb-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add company</button>
      {companies.length === 0 ? <div className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-faint">No companies yet.</div> : (
        <div className="space-y-2">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-app bg-surface px-4 py-3">
              <div><p className="font-medium text-app">{c.name} <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{c.type}</span></p>{c.industry && <p className="text-xs text-muted">{c.industry}</p>}</div>
              <div className="flex gap-3 text-xs"><button onClick={() => setEditing(c)} className="text-emerald-600 hover:underline dark:text-emerald-400">Edit</button><InlineConfirm onConfirm={() => del(c.id)} label="Del" confirmLabel="Delete" className="text-faint hover:text-red-500" /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Deals (kanban) ─────────────────────────────
function Deals({ deals, setDeals, contacts }: { deals: Deal[]; setDeals: (f: (d: Deal[]) => Deal[]) => void; contacts: Contact[] }) {
  const [editing, setEditing] = useState<Partial<Deal> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (!editing?.title?.trim()) return;
    setBusy(true); setErr("");
    try { const d = await api({ entity: "deal", action: "save", data: { ...editing, value: Number(editing.value) || 0 } }); setDeals((ds) => { const ex = ds.some((x) => x.id === d.deal.id); return ex ? ds.map((x) => x.id === d.deal.id ? d.deal : x) : [d.deal, ...ds]; }); setEditing(null); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save that deal."); } finally { setBusy(false); }
  };
  // Guard against overlapping writes when a select/checkbox is clicked rapidly.
  const [savingId, setSavingId] = useState<string | null>(null);
  const move = async (id: string, stage: string) => {
    if (savingId === "deal:" + id) return;
    setErr(""); setSavingId("deal:" + id);
    try { await api({ entity: "deal", action: "move", id, stage }); setDeals((ds) => ds.map((d) => d.id === id ? { ...d, stage, status: stage === "won" ? "won" : stage === "lost" ? "lost" : "open" } : d)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't move that deal."); }
    finally { setSavingId(null); }
  };

  if (editing) {
    return (
      <RecordForm title={editing.id ? "Edit deal" : "New deal"} onSave={save} onCancel={() => setEditing(null)} busy={busy} canSave={!!editing.title?.trim()}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Inp label="Title" v={editing.title ?? ""} on={(v) => setEditing({ ...editing, title: v })} />
          <Inp label="Value ($)" type="number" v={String(editing.value ?? "")} on={(v) => setEditing({ ...editing, value: Number(v) })} />
          <Sel label="Stage" v={editing.stage ?? "lead"} opts={DEAL_STAGES} on={(v) => setEditing({ ...editing, stage: v })} />
          <Sel label="Contact" v={editing.contactId ?? ""} opts={["", ...contacts.map((c) => c.id)]} labels={["—", ...contacts.map((c) => c.fullName)]} on={(v) => setEditing({ ...editing, contactId: v || null })} />
          <Inp label="Close date" type="date" v={editing.closeDate ?? ""} on={(v) => setEditing({ ...editing, closeDate: v })} />
        </div>
        <Inp label="Notes" textarea v={editing.notes ?? ""} on={(v) => setEditing({ ...editing, notes: v })} />
      </RecordForm>
    );
  }
  return (
    <div>
      {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <button onClick={() => setEditing({ stage: "lead", value: 0 })} className="mb-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add deal</button>
      <div className="grid gap-3 lg:grid-cols-6">
        {DEAL_STAGES.map((stage) => {
          const items = deals.filter((d) => d.stage === stage);
          const total = items.reduce((s, d) => s + (d.value || 0), 0);
          return (
            <div key={stage} className="rounded-xl border border-app bg-surface-2/40 p-2">
              <p className="mb-2 px-1 text-xs font-semibold uppercase text-faint">{stage} · {items.length}</p>
              {total > 0 && <p className="mb-2 px-1 text-[11px] text-muted">{money(total)}</p>}
              <div className="space-y-2">
                {items.map((d) => (
                  <div key={d.id} className="rounded-lg border border-app bg-surface p-2.5">
                    <p className="text-sm font-medium text-app">{d.title}</p>
                    <p className="text-xs text-muted">{money(d.value)}{d.closeDate ? ` · ${d.closeDate}` : ""}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      <select value={d.stage} onChange={(e) => move(d.id, e.target.value)} className="rounded border border-app bg-surface-2 px-1 py-0.5 text-[10px] text-app focus:outline-none">
                        {DEAL_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button onClick={() => setEditing(d)} className="text-[10px] text-emerald-600 hover:underline dark:text-emerald-400">edit</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── Tasks ─────────────────────────────
function Tasks({ tasks, setTasks, contacts }: { tasks: Task[]; setTasks: (f: (t: Task[]) => Task[]) => void; contacts: Contact[] }) {
  const [title, setTitle] = useState(""); const [due, setDue] = useState(""); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null); // guard rapid checkbox toggles
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true); setErr("");
    try { const d = await api({ entity: "task", action: "save", data: { title, dueDate: due || null } }); setTasks((ts) => [...ts, d.task]); setTitle(""); setDue(""); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add that task."); } finally { setBusy(false); }
  };
  const toggle = async (t: Task) => { if (savingId === "task:" + t.id) return; setErr(""); setSavingId("task:" + t.id); try { const d = await api({ entity: "task", action: "save", data: { ...t, done: !t.done } }); setTasks((ts) => ts.map((x) => x.id === t.id ? d.task : x)); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't update that task."); } finally { setSavingId(null); } };
  const del = async (id: string) => {
    setErr("");
    try { await api({ entity: "task", action: "delete", id }); setTasks((ts) => ts.filter((t) => t.id !== id)); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't delete that task."); }
  };
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.fullName ?? "";

  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  return (
    <div>
      {err && <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">{err}</p>}
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl border border-app bg-surface p-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="New task…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
        <button onClick={add} disabled={busy || !title.trim()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">Add</button>
      </div>
      <div className="space-y-2">
        {open.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-app bg-surface px-3 py-2.5">
            <button onClick={() => toggle(t)} className="h-4 w-4 shrink-0 rounded border border-app" aria-label="complete" />
            <span className="flex-1 text-sm text-app">{t.title}{contactName(t.contactId) && <span className="ml-1 text-xs text-faint">· {contactName(t.contactId)}</span>}</span>
            {t.dueDate && <span className={`text-xs ${t.dueDate <= new Date().toISOString().slice(0, 10) ? "text-red-500" : "text-faint"}`}>{t.dueDate}</span>}
            <InlineConfirm onConfirm={() => del(t.id)} label="✕" confirmLabel="Delete" className="text-xs text-faint hover:text-red-500" />
          </div>
        ))}
        {open.length === 0 && <p className="py-6 text-center text-sm text-faint">No open tasks. 🎉</p>}
        {done.length > 0 && <p className="mt-4 px-1 text-xs font-semibold uppercase text-faint">Done</p>}
        {done.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-app bg-surface-2/40 px-3 py-2 opacity-60">
            <button onClick={() => toggle(t)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-500 text-[10px] text-white">✓</button>
            <span className="flex-1 text-sm text-muted line-through">{t.title}</span>
            <InlineConfirm onConfirm={() => del(t.id)} label="✕" confirmLabel="Delete" className="text-xs text-faint hover:text-red-500" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── shared form bits ─────────────────────────────
function RecordForm({ title, children, onSave, onCancel, busy, canSave }: { title: string; children: React.ReactNode; onSave: () => void; onCancel: () => void; busy: boolean; canSave: boolean }) {
  return (
    <div className="space-y-3 rounded-2xl border border-app bg-surface p-5">
      <h3 className="font-semibold text-app">{title}</h3>
      {children}
      <div className="flex gap-2"><button onClick={onSave} disabled={busy || !canSave} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button><button onClick={onCancel} className="rounded-lg border border-app px-5 py-2 text-sm text-app hover:bg-app-hover">Cancel</button></div>
    </div>
  );
}
function Inp({ label, v, on, type = "text", textarea }: { label: string; v: string; on: (v: string) => void; type?: string; textarea?: boolean }) {
  return (
    <label className="block text-sm"><span className="mb-1 block font-medium text-app">{label}</span>
      {textarea ? <textarea value={v} onChange={(e) => on(e.target.value)} rows={2} className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        : <input type={type} value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />}
    </label>
  );
}
function Sel({ label, v, opts, labels, on }: { label: string; v: string; opts: string[]; labels?: string[]; on: (v: string) => void }) {
  return (
    <label className="block text-sm"><span className="mb-1 block font-medium text-app">{label}</span>
      <select value={v} onChange={(e) => on(e.target.value)} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
        {opts.map((o, i) => <option key={o || i} value={o}>{labels ? labels[i] : o}</option>)}
      </select>
    </label>
  );
}

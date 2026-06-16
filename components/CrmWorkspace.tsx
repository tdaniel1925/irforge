"use client";

import { useState } from "react";

// ── shared types (mirror lib/crm.ts) ──
interface Contact { id: string; crmCompanyId: string | null; fullName: string; title: string; email: string; phone: string; category: string; stage: string; topics: string[]; aum: string; peersHeld: string[]; notes: string; nextFollowup: string | null; lastTouchAt: string | null }
interface Company { id: string; name: string; type: string; industry: string; website: string; notes: string }
interface Deal { id: string; title: string; stage: string; value: number; currency: string; contactId: string | null; crmCompanyId: string | null; closeDate: string | null; status: string; notes: string }
interface Task { id: string; title: string; dueDate: string | null; done: boolean; contactId: string | null }
interface Metrics { contacts: number; openDeals: number; pipelineValue: number; wonValue: number; wonCount: number; lostCount: number; activities7d: number; tasksDue: number; dealsByStage: Record<string, { count: number; value: number }> }

const DEAL_STAGES = ["lead", "qualified", "meeting", "proposal", "won", "lost"];
const CONTACT_CATS = ["investor", "analyst", "journalist", "partner", "procurement", "talent", "shareholder", "other"];

const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${(n / 1e3).toFixed(0)}K` : `$${n}`);

async function api(body: object) {
  const res = await fetch("/api/crm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed.");
  return res.json();
}

export default function CrmWorkspace({ initialContacts, initialCompanies, initialDeals, initialTasks, metrics }: {
  initialContacts: Contact[]; initialCompanies: Company[]; initialDeals: Deal[]; initialTasks: Task[]; metrics: Metrics;
}) {
  const [tab, setTab] = useState("dashboard");
  const [contacts, setContacts] = useState(initialContacts);
  const [companies, setCompanies] = useState(initialCompanies);
  const [deals, setDeals] = useState(initialDeals);
  const [tasks, setTasks] = useState(initialTasks);

  const TABS = [
    { k: "dashboard", label: "📊 Dashboard" },
    { k: "contacts", label: `👤 Contacts (${contacts.length})` },
    { k: "companies", label: `🏢 Companies (${companies.length})` },
    { k: "deals", label: `💼 Deals (${deals.filter((d) => d.status === "open").length})` },
    { k: "tasks", label: `✅ Tasks (${tasks.filter((t) => !t.done).length})` },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${tab === t.k ? "bg-emerald-600 text-white" : "border border-app text-muted hover:text-app"}`}>{t.label}</button>
        ))}
        <a href="/crm/import" className="ml-auto rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-app hover:bg-app-hover">⤓ Import / Export</a>
      </div>

      {tab === "dashboard" && <Dashboard metrics={metrics} deals={deals} tasks={tasks} />}
      {tab === "contacts" && <Contacts contacts={contacts} setContacts={setContacts} companies={companies} />}
      {tab === "companies" && <Companies companies={companies} setCompanies={setCompanies} />}
      {tab === "deals" && <Deals deals={deals} setDeals={setDeals} contacts={contacts} />}
      {tab === "tasks" && <Tasks tasks={tasks} setTasks={setTasks} contacts={contacts} />}
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

  const save = async () => {
    if (!editing?.fullName?.trim()) return;
    setBusy(true);
    try {
      const d = await api({ entity: "contact", action: "save", data: editing });
      setContacts((cs) => { const ex = cs.some((c) => c.id === d.contact.id); return ex ? cs.map((c) => c.id === d.contact.id ? d.contact : c) : [d.contact, ...cs]; });
      setEditing(null);
    } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    try { await api({ entity: "contact", action: "delete", id }); setContacts((cs) => cs.filter((c) => c.id !== id)); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't delete that contact."); }
  };

  const shown = contacts.filter((c) => (!q || `${c.fullName} ${c.email} ${c.title}`.toLowerCase().includes(q.toLowerCase())) && (!cat || c.category === cat));
  const compName = (id: string | null) => companies.find((co) => co.id === id)?.name ?? "";

  if (editing) {
    return (
      <RecordForm title={editing.id ? "Edit contact" : "New contact"} onSave={save} onCancel={() => setEditing(null)} busy={busy} canSave={!!editing.fullName?.trim()}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Inp label="Full name" v={editing.fullName ?? ""} on={(v) => setEditing({ ...editing, fullName: v })} />
          <Inp label="Title" v={editing.title ?? ""} on={(v) => setEditing({ ...editing, title: v })} />
          <Inp label="Email" v={editing.email ?? ""} on={(v) => setEditing({ ...editing, email: v })} />
          <Inp label="Phone" v={editing.phone ?? ""} on={(v) => setEditing({ ...editing, phone: v })} />
          <Sel label="Category" v={editing.category ?? "investor"} opts={CONTACT_CATS} on={(v) => setEditing({ ...editing, category: v })} />
          <Sel label="Company" v={editing.crmCompanyId ?? ""} opts={["", ...companies.map((c) => c.id)]} labels={["—", ...companies.map((c) => c.name)]} on={(v) => setEditing({ ...editing, crmCompanyId: v || null })} />
          <Inp label="AUM (funds)" v={editing.aum ?? ""} on={(v) => setEditing({ ...editing, aum: v })} />
          <Inp label="Next follow-up" type="date" v={editing.nextFollowup ?? ""} on={(v) => setEditing({ ...editing, nextFollowup: v })} />
        </div>
        <Inp label="Notes" textarea v={editing.notes ?? ""} on={(v) => setEditing({ ...editing, notes: v })} />
      </RecordForm>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search contacts…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none"><option value="">All categories</option>{CONTACT_CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <button onClick={() => setEditing({ category: "investor" })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-app bg-surface text-left text-xs text-faint"><th className="px-3 py-2">Name</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Email</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-b border-app bg-surface">
                <td className="px-3 py-2.5"><span className="font-medium text-app">{c.fullName}</span>{c.title && <span className="block text-xs text-faint">{c.title}</span>}</td>
                <td className="px-3 py-2.5 text-muted">{compName(c.crmCompanyId)}</td>
                <td className="px-3 py-2.5"><span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{c.category}</span></td>
                <td className="px-3 py-2.5 text-muted">{c.email}</td>
                <td className="px-3 py-2.5 text-right"><button onClick={() => setEditing(c)} className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">Edit</button> <button onClick={() => del(c.id)} className="ml-2 text-xs text-faint hover:text-red-500">Del</button></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-faint">No contacts. Add one or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ───────────────────────────── Companies ─────────────────────────────
function Companies({ companies, setCompanies }: { companies: Company[]; setCompanies: (f: (c: Company[]) => Company[]) => void }) {
  const [editing, setEditing] = useState<Partial<Company> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!editing?.name?.trim()) return;
    setBusy(true);
    try { const d = await api({ entity: "company", action: "save", data: editing }); setCompanies((cs) => { const ex = cs.some((c) => c.id === d.company.id); return ex ? cs.map((c) => c.id === d.company.id ? d.company : c) : [d.company, ...cs]; }); setEditing(null); } finally { setBusy(false); }
  };
  const del = async (id: string) => {
    try { await api({ entity: "company", action: "delete", id }); setCompanies((cs) => cs.filter((c) => c.id !== id)); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't delete that company."); }
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
      <button onClick={() => setEditing({ type: "fund" })} className="mb-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add company</button>
      {companies.length === 0 ? <div className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-faint">No companies yet.</div> : (
        <div className="space-y-2">
          {companies.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-xl border border-app bg-surface px-4 py-3">
              <div><p className="font-medium text-app">{c.name} <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{c.type}</span></p>{c.industry && <p className="text-xs text-muted">{c.industry}</p>}</div>
              <div className="flex gap-3 text-xs"><button onClick={() => setEditing(c)} className="text-emerald-600 hover:underline dark:text-emerald-400">Edit</button><button onClick={() => del(c.id)} className="text-faint hover:text-red-500">Del</button></div>
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
  const save = async () => {
    if (!editing?.title?.trim()) return;
    setBusy(true);
    try { const d = await api({ entity: "deal", action: "save", data: { ...editing, value: Number(editing.value) || 0 } }); setDeals((ds) => { const ex = ds.some((x) => x.id === d.deal.id); return ex ? ds.map((x) => x.id === d.deal.id ? d.deal : x) : [d.deal, ...ds]; }); setEditing(null); } finally { setBusy(false); }
  };
  const move = async (id: string, stage: string) => {
    try { await api({ entity: "deal", action: "move", id, stage }); setDeals((ds) => ds.map((d) => d.id === id ? { ...d, stage, status: stage === "won" ? "won" : stage === "lost" ? "lost" : "open" } : d)); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't move that deal."); }
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
  const add = async () => {
    if (!title.trim()) return;
    setBusy(true);
    try { const d = await api({ entity: "task", action: "save", data: { title, dueDate: due || null } }); setTasks((ts) => [...ts, d.task]); setTitle(""); setDue(""); } finally { setBusy(false); }
  };
  const toggle = async (t: Task) => { const d = await api({ entity: "task", action: "save", data: { ...t, done: !t.done } }); setTasks((ts) => ts.map((x) => x.id === t.id ? d.task : x)); };
  const del = async (id: string) => {
    try { await api({ entity: "task", action: "delete", id }); setTasks((ts) => ts.filter((t) => t.id !== id)); }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't delete that task."); }
  };
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.fullName ?? "";

  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  return (
    <div>
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
            <button onClick={() => del(t.id)} className="text-xs text-faint hover:text-red-500">✕</button>
          </div>
        ))}
        {open.length === 0 && <p className="py-6 text-center text-sm text-faint">No open tasks. 🎉</p>}
        {done.length > 0 && <p className="mt-4 px-1 text-xs font-semibold uppercase text-faint">Done</p>}
        {done.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-lg border border-app bg-surface-2/40 px-3 py-2 opacity-60">
            <button onClick={() => toggle(t)} className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-500 bg-emerald-500 text-[10px] text-white">✓</button>
            <span className="flex-1 text-sm text-muted line-through">{t.title}</span>
            <button onClick={() => del(t.id)} className="text-xs text-faint hover:text-red-500">✕</button>
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

"use client";

import { useState } from "react";

interface Stakeholder { id: string; fullName: string; title: string; org: string; category: string; topics: string[]; email: string; notes: string }
interface Interaction { id: string; channel: string; direction: string; summary: string; body: string; status: string; suggestedOwner: string; suggestedReply: string; occurredAt: string }

const CATEGORIES = ["investor", "analyst", "journalist", "partner", "procurement", "talent", "other"];
const BLANK: Stakeholder = { id: "", fullName: "", title: "", org: "", category: "investor", topics: [], email: "", notes: "" };

export default function StakeholderHub({ initialStakeholders, initialInteractions }: { initialStakeholders: Stakeholder[]; initialInteractions: Interaction[] }) {
  const [tab, setTab] = useState<"people" | "inbound">("inbound");
  const [people, setPeople] = useState<Stakeholder[]>(initialStakeholders);
  const [inbox, setInbox] = useState<Interaction[]>(initialInteractions);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <Tab active={tab === "inbound"} onClick={() => setTab("inbound")} label={`📥 Inbound (${inbox.length})`} />
        <Tab active={tab === "people"} onClick={() => setTab("people")} label={`🤝 People (${people.length})`} />
      </div>
      {tab === "inbound" ? <Inbound inbox={inbox} setInbox={setInbox} /> : <People people={people} setPeople={setPeople} />}
    </div>
  );
}

function Tab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-emerald-600 text-white" : "border border-app text-muted hover:text-app"}`}>{label}</button>;
}

function Inbound({ inbox, setInbox }: { inbox: Interaction[]; setInbox: (f: (i: Interaction[]) => Interaction[]) => void }) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const triage = async () => {
    if (!msg.trim()) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/iros/stakeholders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "inbound", message: msg, channel: "other" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setInbox((i) => [d.interaction, ...i]);
      setMsg("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  };

  const resolve = async (id: string) => {
    setError("");
    try {
      const res = await fetch("/api/iros/stakeholders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "interaction_status", id, status: "resolved" }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't mark that resolved.");
        return;
      }
      setInbox((i) => i.map((x) => (x.id === id ? { ...x, status: "resolved" } : x)));
    } catch {
      setError("Network error — couldn't mark that resolved.");
    }
  };

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-app bg-surface p-5">
        <p className="mb-2 text-sm font-medium text-app">Paste an inbound DM, email, or comment — AI triages it</p>
        <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3} placeholder="e.g. 'Hi, I'm a portfolio manager at Acme Capital. Can we set up a call about your latest results?'"
          className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <button onClick={triage} disabled={busy || !msg.trim()} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Triaging…" : "✨ Triage & log"}</button>
      </div>

      {inbox.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">No inbound logged yet.</p>
      ) : (
        <div className="space-y-2">
          {inbox.map((it) => (
            <div key={it.id} className={`rounded-xl border border-app p-4 ${it.status === "resolved" ? "bg-surface-2/40 opacity-70" : "bg-surface"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs">
                {it.suggestedOwner && <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-600 dark:text-emerald-300">{it.suggestedOwner}</span>}
                <span className="text-faint">{it.occurredAt?.slice(0, 10)}</span>
                {it.status === "resolved" && <span className="text-emerald-600 dark:text-emerald-400">✓ resolved</span>}
              </div>
              <p className="text-sm text-app">{it.summary || it.body.slice(0, 140)}</p>
              {it.suggestedReply && (
                <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-2.5">
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">Suggested reply (Reg FD–safe)</p>
                  <p className="mt-0.5 text-xs text-muted">{it.suggestedReply}</p>
                </div>
              )}
              {it.status !== "resolved" && (
                <button onClick={() => resolve(it.id)} className="mt-2 text-xs text-muted hover:text-emerald-600 dark:hover:text-emerald-400">Mark resolved</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function People({ people, setPeople }: { people: Stakeholder[]; setPeople: (f: (p: Stakeholder[]) => Stakeholder[]) => void }) {
  const [editing, setEditing] = useState<Stakeholder | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch("/api/iros/stakeholders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save", stakeholder: editing }) });
      const d = await res.json();
      if (res.ok) {
        setPeople((ps) => { const ex = ps.some((p) => p.id === d.stakeholder.id); return ex ? ps.map((p) => p.id === d.stakeholder.id ? d.stakeholder : p) : [...ps, d.stakeholder]; });
        setEditing(null);
      }
    } finally { setBusy(false); }
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-2xl border border-app bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} placeholder="Full name" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <input value={editing.org} onChange={(e) => setEditing({ ...editing, org: e.target.value })} placeholder="Firm / outlet" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Title" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} placeholder="Email" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none sm:col-span-2" />
        </div>
        <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} placeholder="Notes" className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !editing.fullName.trim()} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          <button onClick={() => setEditing(null)} className="rounded-lg border border-app px-5 py-2 text-sm text-app hover:bg-app-hover">Cancel</button>
        </div>
      </div>
    );
  }

  const shown = people.filter((p) => !query || `${p.fullName} ${p.org} ${p.title} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <button onClick={() => setEditing({ ...BLANK })} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add</button>
      </div>
      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">No people yet.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-app bg-surface px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-app">{p.fullName} {p.org && <span className="font-normal text-faint">· {p.org}</span>}</p>
                <p className="text-xs text-muted">{p.title} <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-faint">{p.category}</span></p>
              </div>
              <button onClick={() => setEditing(p)} className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">Edit</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

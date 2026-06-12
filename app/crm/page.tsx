"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Contact, ContactStage } from "@/lib/types";

const STAGES: { key: ContactStage; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting", label: "Meeting" },
  { key: "holder", label: "Holder" },
  { key: "passed", label: "Passed" },
];

const TYPE_LABEL: Record<string, string> = { fund: "Fund", analyst: "Analyst", broker: "Broker", shareholder: "Shareholder", media: "Media", advisor: "Advisor", other: "Contact" };

export default function CRM() {
  const { db, error, refresh } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", firm: "", type: "fund", email: "", aum: "", peersHeld: "", notes: "" });
  const [ix, setIx] = useState<{ id: string; kind: string; summary: string } | null>(null);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const contacts: Contact[] = db.contacts ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const dueFollowUps = contacts.filter((c) => c.nextFollowUp && c.nextFollowUp <= today && c.stage !== "passed" && c.stage !== "holder");

  const post = async (body: object, msg?: string) => {
    setNotice(null);
    const res = await fetch("/api/contacts", { method: body && "id" in body ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) setNotice({ text: data.error ?? "Failed.", tone: "error" });
    else if (msg) setNotice({ text: msg, tone: "success" });
    await refresh();
  };

  const addContact = async () => {
    await post({ ...form, peersHeld: form.peersHeld.split(",").map((p) => p.trim()).filter(Boolean) }, `Added ${form.name}.`);
    setForm({ name: "", firm: "", type: "fund", email: "", aum: "", peersHeld: "", notes: "" });
    setAdding(false);
  };

  return (
    <div>
      <PageHeader title="Investor CRM" subtitle="Every fund, analyst, broker, and shareholder you talk to — with the 13F intelligence to know who already owns companies like yours. This is your relationship pipeline.">
        <Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add contact"}</Button>
      </PageHeader>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {dueFollowUps.length > 0 && (
        <Banner tone="info" message={`${dueFollowUps.length} follow-up${dueFollowUps.length > 1 ? "s" : ""} due: ${dueFollowUps.map((c) => c.name).join(", ")}.`} />
      )}

      {adding && (
        <Card className="mb-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name / Fund" v={form.name} set={(v) => setForm({ ...form, name: v })} />
            <Input label="Firm (if a person)" v={form.firm} set={(v) => setForm({ ...form, firm: v })} />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
                {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <Input label="Email" v={form.email} set={(v) => setForm({ ...form, email: v })} />
            <Input label="AUM (funds)" v={form.aum} set={(v) => setForm({ ...form, aum: v })} />
            <Input label="Peer tickers they hold (comma-sep)" v={form.peersHeld} set={(v) => setForm({ ...form, peersHeld: v.toUpperCase() })} />
          </div>
          <div className="mt-3"><Button onClick={addContact} disabled={!form.name}>Add to CRM</Button></div>
        </Card>
      )}

      {/* Pipeline columns */}
      <div className="grid gap-4 lg:grid-cols-5">
        {STAGES.map((s) => {
          const inStage = contacts.filter((c) => c.stage === s.key);
          return (
            <div key={s.key}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{s.label} ({inStage.length})</p>
              <div className="space-y-2">
                {inStage.map((c) => (
                  <button key={c.id} onClick={() => setOpen(open === c.id ? null : c.id)} className={`w-full rounded-lg border bg-surface p-3 text-left transition hover:border-emerald-500/40 ${open === c.id ? "border-emerald-500/40" : "border-app"}`}>
                    <p className="text-sm font-medium text-app">{c.name}</p>
                    <p className="text-[11px] text-faint">{TYPE_LABEL[c.type]}{c.aum ? ` · ${c.aum}` : ""}</p>
                    {c.peersHeld && c.peersHeld.length > 0 && (
                      <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">holds {c.peersHeld.map((p) => "$" + p).join(", ")}</p>
                    )}
                  </button>
                ))}
                {inStage.length === 0 && <p className="text-xs text-faint">—</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {open && (() => {
        const c = contacts.find((x) => x.id === open);
        if (!c) return null;
        return (
          <Card className="mt-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-app">{c.name}</h3>
                <p className="text-sm text-muted">{TYPE_LABEL[c.type]}{c.firm && c.firm !== c.name ? ` · ${c.firm}` : ""}{c.aum ? ` · AUM ${c.aum}` : ""}{c.email ? ` · ${c.email}` : ""}</p>
                {c.peersHeld && c.peersHeld.length > 0 && (
                  <p className="mt-1 inline-block rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-300">
                    13F intel: holds {c.peersHeld.map((p) => "$" + p).join(", ")} — your peers, so warm for $({db.company.ticker})
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select value={c.stage} onChange={(e) => post({ id: c.id, action: "stage", stage: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-2 py-1.5 text-sm text-app focus:border-emerald-500 focus:outline-none">
                  {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                <button onClick={() => { post({ id: c.id, action: "delete" }); setOpen(null); }} className="text-xs text-faint hover:text-red-500">delete</button>
              </div>
            </div>

            {c.notes && <p className="mt-3 text-sm text-muted">{c.notes}</p>}

            {/* Log interaction */}
            <div className="mt-4">
              {ix?.id === c.id ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select value={ix.kind} onChange={(e) => setIx({ ...ix, kind: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-2 py-2 text-sm text-app focus:outline-none">
                    <option value="call">Call</option><option value="meeting">Meeting</option><option value="email">Email</option><option value="note">Note</option>
                  </select>
                  <input value={ix.summary} onChange={(e) => setIx({ ...ix, summary: e.target.value })} placeholder="What happened?" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                  <Button onClick={async () => { await post({ id: c.id, action: "interaction", kind: ix.kind, summary: ix.summary }); setIx(null); }} disabled={!ix.summary}>Log it</Button>
                </div>
              ) : (
                <Button variant="secondary" onClick={() => setIx({ id: c.id, kind: "call", summary: "" })}>+ Log interaction</Button>
              )}
            </div>

            {c.interactions.length > 0 && (
              <ul className="mt-4 space-y-2 border-l-2 border-app pl-4">
                {c.interactions.map((i) => (
                  <li key={i.id} className="text-sm">
                    <span className="mr-2 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-faint">{i.kind}</span>
                    <span className="text-muted">{i.summary}</span>
                    <span className="ml-2 text-[11px] text-faint">{timeAgo(i.ts)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })()}

      {contacts.length === 0 && !adding && <Card className="mt-6 border-dashed"><p className="py-8 text-center text-sm text-faint">No contacts yet. Add one, or import targets from the Fund Finder.</p></Card>}
    </div>
  );
}

function Input({ label, v, set }: { label: string; v: string; set: (x: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted">{label}</label>
      <input value={v} onChange={(e) => set(e.target.value)} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { Notice } from "@/components/ui";
import InlineConfirm from "@/components/InlineConfirm";
import type { CapTableEntry, ConvertibleNote, HolderIntent } from "@/lib/types";
import { computeDilution, noteShares } from "@/lib/capMath";

const CLASS_LABEL: Record<string, string> = { common: "Common", preferred: "Preferred", insider: "Insider", options: "Options", warrants: "Warrants" };
const INTENT: { key: HolderIntent; label: string; color: string }[] = [
  { key: "accumulating", label: "Accumulating", color: "text-emerald-600 dark:text-emerald-400" },
  { key: "holding", label: "Holding", color: "text-sky-600 dark:text-sky-400" },
  { key: "trimming", label: "Trimming", color: "text-amber-600 dark:text-amber-400" },
  { key: "exiting", label: "Exiting", color: "text-red-600 dark:text-red-400" },
  { key: "unknown", label: "Unknown", color: "text-faint" },
];

const fmt = (n: number) => n.toLocaleString();
const money = (n: number) => (Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`);

export default function CapTablePage() {
  const { db, error, refresh } = useAppState();
  const [tab, setTab] = useState<"cap" | "notes">("cap");
  const [notice, setNotice] = useState<Notice>(null);
  // Share price drives note-conversion + dilution math. Default $1.00, but the
  // user sets the real current price so the numbers aren't misleading.
  const [priceInput, setPriceInput] = useState("1.00");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const cap: CapTableEntry[] = db.capTable ?? [];
  const notes: ConvertibleNote[] = db.convertibleNotes ?? [];
  const marketPrice = Math.max(0.0001, Number(priceInput) || 1.0);
  const d = computeDilution(cap, notes, marketPrice);

  return (
    <div>
      <PageHeader title="Cap Table" subtitle="Your fully-diluted ownership — common, preferred, options, warrants, and what convertible notes turn into." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm">
        <label className="font-medium text-app">Current share price</label>
        <span className="text-faint">$</span>
        <input value={priceInput} onChange={(e) => setPriceInput(e.target.value)} type="number" step="0.01" min="0"
          className="w-24 rounded border border-app bg-surface px-2 py-1 text-app focus:border-emerald-500 focus:outline-none" />
        <span className="text-xs text-faint">Used to value note conversions &amp; dilution. Enter your live price for accurate numbers.</span>
      </div>

      {/* Dilution summary */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><p className="text-xs text-faint">Basic shares</p><p className="mt-1 text-2xl font-semibold text-app">{fmt(d.basic)}</p><p className="text-xs text-faint">common + preferred + insider</p></Card>
        <Card><p className="text-xs text-faint">Fully diluted</p><p className="mt-1 text-2xl font-semibold text-app">{fmt(d.fullyDiluted)}</p><p className="text-xs text-faint">incl. options, warrants, notes</p></Card>
        <Card className={d.overhangPct > 30 ? "border-amber-500/40" : ""}><p className="text-xs text-faint">Dilution overhang</p><p className="mt-1 text-2xl font-semibold text-app">{d.overhangPct.toFixed(0)}%</p><p className="text-xs text-faint">above basic</p></Card>
        <Card className={d.hasVariableNote ? "border-red-500/40" : ""}><p className="text-xs text-faint">Note conversion shares</p><p className="mt-1 text-2xl font-semibold text-app">{fmt(d.noteShares)}</p><p className="text-xs text-faint">{d.hasVariableNote ? "⚠ includes a variable note" : "from convertibles"}</p></Card>
      </div>

      {d.hasVariableNote && (
        <Banner tone="info" message="You hold a variable-conversion ('toxic') note — the lower your share price goes, the more shares it converts into. Watch this one; the dilution figure above moves with your price." />
      )}

      <div className="mb-5 flex gap-1 rounded-lg border border-app bg-surface p-1 text-sm">
        <button onClick={() => setTab("cap")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "cap" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Holders</button>
        <button onClick={() => setTab("notes")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "notes" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Convertible notes ({notes.length})</button>
      </div>

      {tab === "cap" ? <CapHolders db={db} cap={cap} refresh={refresh} setNotice={setNotice} /> : <Notes db={db} notes={notes} marketPrice={marketPrice} refresh={refresh} setNotice={setNotice} />}
    </div>
  );
}

function CapHolders({ db, cap, refresh, setNotice }: { db: { capTable: CapTableEntry[] }; cap: CapTableEntry[]; refresh: () => void; setNotice: (n: Notice) => void }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ holder: "", class: "common", shares: "", costBasis: "", intent: "unknown", notes: "" });

  const add = async () => {
    try {
      const res = await fetch("/api/captable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, shares: Number(f.shares), costBasis: f.costBasis ? Number(f.costBasis) : undefined }) });
      if (res.ok) { setNotice({ text: `Added ${f.holder}.`, tone: "success" }); setF({ holder: "", class: "common", shares: "", costBasis: "", intent: "unknown", notes: "" }); setAdding(false); await refresh(); }
      else setNotice({ text: (await res.json().catch(() => ({}))).error ?? "Couldn't add that holder.", tone: "error" });
    } catch { setNotice({ text: "Network error — couldn't add that holder.", tone: "error" }); }
  };
  // Surface failures: previously a failed edit/delete was silent and the value just
  // snapped back on refresh, misleading the user into thinking nothing happened.
  const patch = async (body: object) => {
    try {
      const res = await fetch("/api/captable", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { setNotice({ text: (await res.json().catch(() => ({}))).error ?? "Couldn't save that change.", tone: "error" }); return; }
    } catch { setNotice({ text: "Network error — that change didn't save.", tone: "error" }); return; }
    await refresh();
  };

  return (
    <div>
      <div className="mb-4 flex justify-end"><Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add holder"}</Button></div>
      {adding && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} placeholder="Holder" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            <select value={f.class} onChange={(e) => setF({ ...f, class: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none">{Object.entries(CLASS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <input value={f.shares} onChange={(e) => setF({ ...f, shares: e.target.value })} placeholder="Shares / units" type="number" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
          </div>
          <div className="mt-3"><Button onClick={add} disabled={!f.holder || !f.shares}>Add</Button></div>
        </Card>
      )}
      <div className="overflow-x-auto rounded-xl border border-app">
        <table className="w-full text-sm">
          <thead><tr className="bg-surface text-left text-xs text-faint"><th className="px-4 py-3 font-medium">Holder</th><th className="px-4 py-3 font-medium">Class</th><th className="px-4 py-3 font-medium">Shares</th><th className="px-4 py-3 font-medium">Cost basis</th><th className="px-4 py-3 font-medium">Intent</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {cap.map((e) => (
              <tr key={e.id} className="border-t border-app bg-surface">
                <td className="px-4 py-3 font-medium text-app">{e.holder}{e.notes ? <span className="block text-[11px] font-normal text-faint">{e.notes}</span> : null}</td>
                <td className="px-4 py-3 text-muted">{CLASS_LABEL[e.class]}{e.strikePrice ? ` @ $${e.strikePrice}` : ""}</td>
                <td className="px-4 py-3 text-app">{fmt(e.shares)}</td>
                <td className="px-4 py-3 text-muted">{e.costBasis ? `$${e.costBasis}` : "—"}</td>
                <td className="px-4 py-3">
                  <select value={e.intent ?? "unknown"} onChange={(ev) => patch({ id: e.id, action: "intent", intent: ev.target.value })} className="rounded border border-app bg-surface-2 px-1.5 py-1 text-xs text-app focus:outline-none">
                    {INTENT.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-right"><InlineConfirm onConfirm={() => patch({ id: e.id, action: "delete" })} label="×" confirmLabel="Remove" className="text-xs text-faint hover:text-red-500" title="Remove holder" /></td>
              </tr>
            ))}
            {cap.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-faint">No holders yet. Click &quot;+ Add holder&quot; to start your cap table.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Notes({ db, notes, marketPrice, refresh, setNotice }: { db: object; notes: ConvertibleNote[]; marketPrice: number; refresh: () => void; setNotice: (n: Notice) => void }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ holder: "", principal: "", interestRate: "", maturityDate: "", conversionType: "fixed", conversionPrice: "", discountPct: "", note: "" });

  const add = async () => {
    const res = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, principal: Number(f.principal), interestRate: Number(f.interestRate), conversionPrice: f.conversionPrice ? Number(f.conversionPrice) : undefined, discountPct: f.discountPct ? Number(f.discountPct) : undefined }) });
    if (res.ok) { setNotice({ text: `Added note for ${f.holder}.`, tone: "success" }); setF({ holder: "", principal: "", interestRate: "", maturityDate: "", conversionType: "fixed", conversionPrice: "", discountPct: "", note: "" }); setAdding(false); await refresh(); }
    else setNotice({ text: (await res.json()).error ?? "Failed.", tone: "error" });
  };
  const patch = async (body: object) => { await fetch("/api/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await refresh(); };

  return (
    <div>
      <div className="mb-4 flex justify-end"><Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add note"}</Button></div>
      {adding && (
        <Card className="mb-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <input value={f.holder} onChange={(e) => setF({ ...f, holder: e.target.value })} placeholder="Holder" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            <input value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} placeholder="Principal $" type="number" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            <input value={f.interestRate} onChange={(e) => setF({ ...f, interestRate: e.target.value })} placeholder="Interest %" type="number" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            <select value={f.conversionType} onChange={(e) => setF({ ...f, conversionType: e.target.value })} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none"><option value="fixed">Fixed conversion</option><option value="variable">Variable / discount</option></select>
            {f.conversionType === "fixed" ? (
              <input value={f.conversionPrice} onChange={(e) => setF({ ...f, conversionPrice: e.target.value })} placeholder="Conversion $/share" type="number" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            ) : (
              <input value={f.discountPct} onChange={(e) => setF({ ...f, discountPct: e.target.value })} placeholder="Discount % to market" type="number" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:outline-none" />
            )}
          </div>
          <div className="mt-3"><Button onClick={add} disabled={!f.holder || !f.principal}>Add note</Button></div>
        </Card>
      )}
      <div className="space-y-3">
        {notes.map((n) => {
          const shares = noteShares(n, marketPrice);
          return (
            <Card key={n.id} className={n.conversionType === "variable" && n.status === "outstanding" ? "border-red-500/30" : ""}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-app">{n.holder} — {money(n.principal)}</p>
                  <p className="text-xs text-muted">{n.interestRate}% · matures {n.maturityDate || "—"} · {n.conversionType === "fixed" ? `converts at $${n.conversionPrice}` : `${n.discountPct}% discount to market (variable)`}</p>
                  {n.note && <p className="mt-1 text-xs text-faint">{n.note}</p>}
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-app">{fmt(shares)} sh</p>
                  <p className="text-[11px] text-faint">at conversion today</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <select value={n.status} onChange={(e) => patch({ id: n.id, action: "status", status: e.target.value })} className="rounded border border-app bg-surface-2 px-2 py-1 text-xs text-app focus:outline-none">
                  <option value="outstanding">Outstanding</option><option value="converted">Converted</option><option value="repaid">Repaid</option>
                </select>
                <InlineConfirm onConfirm={() => patch({ id: n.id, action: "delete" })} label="delete" confirmLabel="Delete" className="text-xs text-faint hover:text-red-500" />
              </div>
            </Card>
          );
        })}
        {notes.length === 0 && <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">No convertible notes tracked.</p></Card>}
      </div>
    </div>
  );
}

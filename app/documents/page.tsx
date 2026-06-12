"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { CompanyDoc, DocCategory } from "@/lib/types";

const CATEGORIES: { key: DocCategory; label: string; hint: string }[] = [
  { key: "filing", label: "SEC Filings", hint: "Your 8-Ks, 10-Ks, 10-Qs — the official record" },
  { key: "governance", label: "Board & Governance", hint: "Charters, minutes, committee materials" },
  { key: "financing", label: "Financings", hint: "Deal docs per raise" },
  { key: "policy", label: "Policies", hint: "Insider trading, disclosure, Reg FD" },
  { key: "ir_material", label: "IR Materials", hint: "Decks, fact sheets, fact books" },
  { key: "other", label: "Other", hint: "Everything else" },
];

export default function Documents() {
  const { db, error, refresh } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [active, setActive] = useState<DocCategory>("filing");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "filing", url: "", note: "" });

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const docs: CompanyDoc[] = db.documents ?? [];
  const inCategory = docs.filter((d) => d.category === active);

  const add = async () => {
    setNotice(null);
    const res = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, category: active }) });
    const data = await res.json();
    if (!res.ok) setNotice({ text: data.error ?? "Failed.", tone: "error" });
    else { setNotice({ text: `Added "${form.name}".`, tone: "success" }); setForm({ name: "", category: active, url: "", note: "" }); setAdding(false); await refresh(); }
  };

  const importFilings = async () => {
    setNotice(null);
    const res = await fetch("/api/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import_filings" }) });
    if (res.ok) { setNotice({ text: "Imported your SEC filings into the vault.", tone: "success" }); await refresh(); }
  };

  const remove = async (id: string) => {
    await fetch("/api/documents", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) });
    await refresh();
  };

  return (
    <div>
      <PageHeader title="Document Vault" subtitle="Every document being a public company requires — filings, board materials, financings, policies, IR decks — organized by what it's for, not scattered across drives.">
        <Button variant="secondary" onClick={importFilings}>Import SEC filings</Button>
        <Button onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "+ Add document"}</Button>
      </PageHeader>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Category nav */}
        <div className="space-y-1">
          {CATEGORIES.map((cat) => {
            const n = docs.filter((d) => d.category === cat.key).length;
            return (
              <button key={cat.key} onClick={() => setActive(cat.key)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${active === cat.key ? "bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-300" : "text-muted hover:bg-app-hover hover:text-app"}`}>
                {cat.label} <span className="text-xs text-faint">{n}</span>
              </button>
            );
          })}
        </div>

        <div>
          <p className="mb-3 text-sm text-muted">{CATEGORIES.find((c) => c.key === active)!.hint}</p>

          {adding && (
            <Card className="mb-4">
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Document name</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Audit Committee Charter" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Link (EDGAR, Drive, etc.) — optional</label>
                  <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Note — optional</label>
                  <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                </div>
                <Button onClick={add} disabled={!form.name}>Add to {CATEGORIES.find((c) => c.key === active)!.label}</Button>
              </div>
            </Card>
          )}

          {inCategory.length === 0 ? (
            <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">Nothing here yet. {active === "filing" ? "Hit 'Import SEC filings' to pull your filings in." : "Add a document above."}</p></Card>
          ) : (
            <div className="space-y-2">
              {inCategory.map((d) => (
                <Card key={d.id} className="flex items-center justify-between gap-3 !p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-app">{d.name}</p>
                    <p className="text-xs text-faint">
                      {d.source === "edgar" ? "EDGAR" : d.source === "link" ? "Linked" : "Uploaded"}
                      {d.filedDate ? ` · filed ${d.filedDate}` : ""}{d.note ? ` · ${d.note}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline dark:text-emerald-300">open ↗</a>}
                    <button onClick={() => remove(d.id)} className="text-xs text-faint hover:text-red-500">remove</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-faint">Demo stores links and metadata. With your account connected, file uploads are stored securely per company (Supabase Storage) with an access log.</p>
    </div>
  );
}

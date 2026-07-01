"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { DocAnalysis } from "@/lib/types";

export default function Analyzer() {
  const { db, error, refresh } = useAppState();
  const [docName, setDocName] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const analyses: DocAnalysis[] = db.docAnalyses ?? [];

  const run = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ docName: docName || "Untitled document", text }) });
      const data = await res.json();
      if (!res.ok) setNotice({ text: data.error ?? "Failed.", tone: "error" });
      else { setNotice({ text: "Analysis ready below.", tone: "success" }); setText(""); setDocName(""); await refresh(); }
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-4xl">
      <PageHeader title="Document Analyzer" subtitle="Paste any document for a plain-English summary, key terms, risks, and whether it may trigger a disclosure. Not legal advice." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className="mb-6">
        <input value={docName} onChange={(e) => setDocName(e.target.value)} placeholder="Document name (e.g. 'Short report from Bear Cave', 'Convertible note term sheet')" className="mb-3 w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Paste the document text here…" className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <div className="mt-3"><Button onClick={run} disabled={busy || text.length < 40}>{busy ? "Analyzing…" : "✦ Analyze document"}</Button></div>
      </Card>

      {analyses.length === 0 ? (
        <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">No analyses yet. Paste a document above to start.</p></Card>
      ) : (
        <div className="space-y-4">
          {analyses.map((a) => (
            <Card key={a.id}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-app">{a.docName}</h3>
                <span className="text-xs text-faint">{timeAgo(a.createdAt)} · {a.engine}</span>
              </div>
              <p className="text-sm leading-relaxed text-muted">{a.summary}</p>

              {a.keyTerms.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {a.keyTerms.map((t, i) => (
                    <div key={i} className="rounded-lg border border-app bg-surface-2 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase text-faint">{t.label}</p>
                      <p className="text-sm text-app">{t.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {a.risks.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-600 dark:text-amber-300">RISKS TO WATCH</p>
                  <ul className="space-y-1">
                    {a.risks.map((r, i) => <li key={i} className="text-sm text-app">• {r}</li>)}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex items-center gap-2 rounded-lg border border-app bg-surface-2 px-3 py-2">
                <span className="text-xs font-semibold text-faint">DISCLOSURE:</span>
                <span className="text-sm text-app">{a.disclosureTrigger}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-faint">Educational/drafting aid only — confirm any disclosure obligation with your securities counsel.</p>
    </div>
  );
}

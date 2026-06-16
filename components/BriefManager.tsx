"use client";

import { useState } from "react";

interface Brief { id: string; ticker: string; title: string; markdown: string; disclosure: string; status: string; published: boolean; createdAt: string }

export default function BriefManager({ initial }: { initial: Brief[] }) {
  const [briefs, setBriefs] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const order = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/brief/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't start checkout.");
      if (d.url) window.location.href = d.url;
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); setBusy(false); }
  };

  const togglePublish = async (b: Brief) => {
    const next = !b.published;
    setBriefs((bs) => bs.map((x) => x.id === b.id ? { ...x, published: next } : x));
    await fetch("/api/brief/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, published: next }) });
  };

  return (
    <div className="space-y-6">
      {/* Order card */}
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-app">Order a Sponsored Research Brief</h2>
            <p className="mt-1 max-w-md text-sm text-muted">AI writes a deep, balanced, filing-based profile of your company — overview, financials, catalysts, and a real risk section. Clearly disclosed as company-sponsored. Publish it to your feed when it&apos;s ready.</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-app">$3,500</p>
            <p className="text-xs text-faint">one-time · vs $15k+ traditional</p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button onClick={order} disabled={busy} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Starting checkout…" : "Order a brief →"}
        </button>
        <p className="mt-3 text-[11px] text-faint">You&apos;re paying us to <span className="font-medium">write</span> it, not to rate it — every brief is factual, includes risks, and carries a sponsorship disclosure. The independent AI Research Panel on your public page stays free and can&apos;t be bought.</p>
      </div>

      {/* Existing briefs */}
      {briefs.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">No briefs yet. Order one above.</p>
      ) : (
        <div className="space-y-3">
          {briefs.map((b) => (
            <div key={b.id} className="rounded-xl border border-app bg-surface p-5">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-app">{b.title || `$${b.ticker} brief`}</span>
                <StatusBadge status={b.status} />
                <span className="ml-auto text-xs text-faint">{b.createdAt?.slice(0, 10)}</span>
              </div>
              {b.status === "ordered" && <p className="text-sm text-muted">Awaiting payment confirmation…</p>}
              {b.status === "paid" && <p className="text-sm text-muted">Paid — generating your brief…</p>}
              {(b.status === "generated" || b.status === "published") && (
                <>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap rounded-lg border border-app bg-surface-2 p-4 text-sm text-app">{b.markdown}</div>
                  <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">{b.disclosure}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <button onClick={() => togglePublish(b)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${b.published ? "border border-app text-app hover:bg-app-hover" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
                      {b.published ? "Unpublish" : "Publish to my feed"}
                    </button>
                    {b.published && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ Published</span>}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ordered: "bg-slate-500/15 text-faint", paid: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    generated: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", published: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${map[status] ?? map.ordered}`}>{status}</span>;
}

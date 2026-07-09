"use client";

import { useState } from "react";

interface MetricChange {
  metric: string;
  prev: number;
  prevAsOf: string;
  latest: number;
  latestAsOf: string;
  pctChange: number | null;
}
interface Diff {
  companyName: string;
  changes: MetricChange[];
  summary: string;
  engine: "claude" | "template";
}

function fmt(metric: string, n: number): string {
  if (metric === "Shares outstanding") {
    return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
  }
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `$${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 1e3 ? `$${(abs / 1e3).toFixed(0)}K` : `$${abs.toFixed(0)}`;
  return n < 0 ? `-${s}` : s;
}

// "What changed?" — reader-triggered period-over-period diff of key XBRL figures.
// Same on-demand pattern as the reality-check: nothing runs until a reader asks.
export default function FilingChanges({ ticker }: { ticker: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [diff, setDiff] = useState<Diff | null>(null);
  const [error, setError] = useState("");

  const run = async () => {
    setState("busy"); setError("");
    try {
      const r = await fetch(`/api/t/filing-diff?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? "Couldn't compute the changes."); setState("error"); return; }
      setDiff(d.diff); setState("done");
    } catch {
      setError("Network error — try again."); setState("error");
    }
  };

  if (state === "idle" || state === "busy") {
    return (
      <button onClick={run} disabled={state === "busy"}
        className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300">
        {state === "busy" ? "Comparing periods…" : "Δ What changed since the last period?"}
      </button>
    );
  }
  if (state === "error") {
    return <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">{error} <button onClick={run} className="underline">retry</button></p>;
  }
  if (!diff) return null;

  return (
    <div className="mt-3 rounded-xl border border-app bg-surface-2 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">What changed · period over period · SEC XBRL</p>
      {diff.changes.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {diff.changes.map((c) => {
            const up = c.latest > c.prev;
            const flat = c.latest === c.prev;
            return (
              <div key={c.metric} className="rounded-lg border border-app bg-surface px-3 py-2">
                <p className="text-[11px] text-faint">{c.metric}</p>
                <p className="text-sm font-semibold text-app">
                  {fmt(c.metric, c.latest)}
                  {!flat && c.pctChange !== null && (
                    <span className={`ml-2 text-xs font-medium ${up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {up ? "▲" : "▼"} {Math.abs(c.pctChange).toFixed(1)}%
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-faint">from {fmt(c.metric, c.prev)} ({c.prevAsOf} → {c.latestAsOf})</p>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="mt-2.5 text-sm leading-relaxed text-app">{diff.summary}</p>
      <p className="mt-1.5 text-[11px] text-faint">
        Straight restatement of SEC-filed figures ({diff.engine === "claude" ? "AI-worded from the numbers" : "generated from the numbers"}) — descriptive only, not advice.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";

// One click: generate this week's IR summary (and email it if configured).
export default function SummaryButton() {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");
  const [emailed, setEmailed] = useState(false);
  const [error, setError] = useState("");

  const go = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/iros/summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setSummary(d.markdown);
      setEmailed(Boolean(d.emailed));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-app bg-surface p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-app">Weekly summary</p>
          <p className="text-xs text-muted">AI writes a board-ready recap of the week. Emailed to you if email is set up.</p>
        </div>
        <button onClick={go} disabled={busy} className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Writing…" : "✨ Generate"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      {summary && (
        <div className="mt-4 rounded-lg border border-app bg-surface-2 p-4">
          {emailed && <p className="mb-2 text-xs text-emerald-600 dark:text-emerald-400">✓ Emailed to you</p>}
          <pre className="whitespace-pre-wrap font-sans text-sm text-app">{summary}</pre>
        </div>
      )}
    </div>
  );
}

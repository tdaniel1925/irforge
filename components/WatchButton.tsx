"use client";

import { useState } from "react";

// "Watch $TICKER" — capture an email to get alerts on new filings, insider
// trades, halts, and grade changes. Signal-only, the opposite of a noise feed.
export default function WatchButton({ ticker }: { ticker: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "already">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/watch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't subscribe.");
      setState(data.already ? "already" : "done");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Failed.");
    }
  };

  if (state === "done" || state === "already") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-300">
        🔔 {state === "already" ? `Already watching $${ticker}` : `Watching $${ticker} — check your inbox`}
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-app px-3 py-2 text-sm font-semibold text-app transition hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-300"
      >
        🔔 Watch ${ticker}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          autoFocus
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && email && submit()}
          placeholder="you@email.com"
          className="w-52 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={state === "busy" || !email}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {state === "busy" ? "…" : "Notify me"}
        </button>
      </div>
      <p className="text-[11px] text-faint">
        Alerts on new filings, insider trades, halts &amp; grade changes. No spam, unsubscribe anytime.
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

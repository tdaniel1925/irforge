"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Try-it-now ticker search for marketing pages — the highest-intent CTA for
// investors (let them hit the real product instantly, no signup). Optional
// suggestion chips seed a few example tickers.
export default function TickerSearch({ suggestions = [] }: { suggestions?: string[] }) {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const go = (t: string) => t && router.push(`/t/${t.toUpperCase()}`);

  return (
    <div className="mx-auto max-w-md">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 overflow-hidden rounded-xl border border-app bg-surface focus-within:border-emerald-500">
          <span className="flex items-center pl-4 text-faint">$</span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && go(ticker)}
            placeholder="Look up any ticker — e.g. LAC"
            className="w-full bg-transparent px-2 py-3 uppercase tracking-wide text-app placeholder:normal-case placeholder:tracking-normal focus:outline-none"
          />
        </div>
        <button onClick={() => go(ticker)} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Research it free →
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-faint">Try:</span>
          {suggestions.map((s) => (
            <button key={s} onClick={() => go(s)} className="rounded-full border border-app px-2.5 py-1 text-xs font-medium text-app transition hover:bg-app-hover">
              ${s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

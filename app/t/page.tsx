"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  { ticker: "LAC", label: "Lithium Americas" },
  { ticker: "SGML", label: "Sigma Lithium" },
  { ticker: "ALB", label: "Albemarle" },
];

export default function TickerIndexPage() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const [peers, setPeers] = useState("");

  const go = () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    const q = peers.trim() ? `?peers=${encodeURIComponent(peers.trim().toUpperCase())}` : "";
    router.push(`/t/${encodeURIComponent(t)}${q}`);
  };

  return (
    <div className="mx-auto max-w-2xl pt-12 text-center">
      <h1 className="text-3xl font-bold text-white">
        Any ticker. <span className="text-emerald-400">Full picture.</span> 15 seconds.
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm text-slate-400">
        A live investor-visibility report built from public sources — SEC filings, social sentiment, news coverage,
        and trading pulse. No login, no tracking, just the data.
      </p>

      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Enter a ticker — e.g. LAC"
          autoFocus
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-center text-lg uppercase tracking-wider text-white focus:border-emerald-500 focus:outline-none"
        />
        <input
          value={peers}
          onChange={(e) => setPeers(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && go()}
          placeholder="Optional: peer tickers for comparison (comma-separated)"
          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-center text-sm uppercase text-slate-300 focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={go}
          className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-400"
        >
          ✦ Generate report
        </button>
      </div>

      <p className="mt-5 text-sm text-slate-400">
        Or browse what&apos;s hot:{" "}
        <a href="/discover" className="font-medium text-emerald-400 hover:underline">
          🔥 Discover trending tickers →
        </a>
      </p>

      <div className="mt-6 flex justify-center gap-3 text-sm">
        <span className="text-slate-600">Try:</span>
        {EXAMPLES.map((e) => (
          <button key={e.ticker} onClick={() => router.push(`/t/${e.ticker}`)} className="text-emerald-400 hover:underline">
            ${e.ticker}
          </button>
        ))}
      </div>

      <p className="mt-12 text-xs text-slate-600">
        Reports are generated from live public data and cached for 15 minutes. Not investment advice.
      </p>
    </div>
  );
}

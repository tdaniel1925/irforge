"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  { ticker: "LAC", label: "Lithium Americas" },
  { ticker: "SGML", label: "Sigma Lithium" },
  { ticker: "NWBO", label: "NorthWest Bio" },
  { ticker: "BIEL", label: "Bioelectronics" },
  { ticker: "ELTP", label: "Elite Pharma" },
];

const POINTS = [
  { icon: "📄", label: "SEC filings" },
  { icon: "💵", label: "Cash & runway" },
  { icon: "👤", label: "Insider trades" },
  { icon: "📊", label: "Short interest" },
  { icon: "🤖", label: "AI analysis" },
  { icon: "💬", label: "Moderated board" },
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
    <div className="relative min-h-[calc(100vh-2rem)] overflow-hidden">
      {/* Branded backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_-10%,rgba(16,185,129,0.18),transparent_55%)]" />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(var(--c-text) 1px, transparent 1px), linear-gradient(90deg, var(--c-text) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Top bar: back home + discover */}
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 pt-2">
        <Link href="/" className="text-sm text-muted transition hover:text-app">
          ← Home
        </Link>
        <Link href="/discover" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
          🔥 Discover trending →
        </Link>
      </div>

      <div className="mx-auto max-w-2xl px-4 pt-10 text-center sm:pt-16">
        {/* Badge */}
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Live public-data intelligence
        </span>

        <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-app sm:text-5xl">
          Any ticker.
          <br className="sm:hidden" />{" "}
          <span className="bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">
            The full picture.
          </span>
          <br />
          <span className="text-app">In 15 seconds.</span>
        </h1>

        <p className="mx-auto mt-4 max-w-lg text-base text-muted">
          One live investor report from a dozen public sources — SEC filings, financials, insider &amp; short data,
          news, an AI bull/bear take, and a moderated board. No login. No noise.
        </p>

        {/* Search card */}
        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-app bg-surface p-4 shadow-xl shadow-emerald-500/5">
          <div className="flex flex-col gap-3">
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="Enter a ticker — e.g. LAC"
              autoFocus
              className="rounded-xl border border-app bg-surface-2 px-4 py-3.5 text-center text-lg font-semibold uppercase tracking-wider text-app placeholder:font-normal placeholder:tracking-normal placeholder:text-faint focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            <input
              value={peers}
              onChange={(e) => setPeers(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && go()}
              placeholder="Optional: peer tickers to compare (comma-separated)"
              className="rounded-xl border border-app bg-surface-2 px-4 py-2.5 text-center text-sm uppercase text-app placeholder:normal-case placeholder:text-faint focus:border-emerald-500 focus:outline-none"
            />
            <button
              onClick={go}
              disabled={!ticker.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 hover:shadow-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              ✦ Generate the report
            </button>
          </div>

          {/* What you get — quick chips */}
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {POINTS.map((p) => (
              <span key={p.label} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted">
                {p.icon} {p.label}
              </span>
            ))}
          </div>
        </div>

        {/* Popular tickers */}
        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Popular right now</p>
          <div className="mt-2.5 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e.ticker}
                onClick={() => router.push(`/t/${e.ticker}`)}
                className="group rounded-xl border border-app bg-surface px-3.5 py-2 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/[0.06]"
              >
                <span className="block text-sm font-bold text-emerald-600 dark:text-emerald-400">${e.ticker}</span>
                <span className="block text-[11px] text-faint group-hover:text-muted">{e.label}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-10 text-xs text-faint">
          Reports are generated from live public data and cached for 15 minutes. Not investment advice.
        </p>
      </div>
    </div>
  );
}

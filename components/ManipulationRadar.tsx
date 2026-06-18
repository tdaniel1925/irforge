"use client";

import { useEffect, useState } from "react";

type RadarLevel = "none" | "watch" | "elevated";
type RadarResult = {
  level: RadarLevel;
  signals: string[];
  caption: string;
  counts: {
    hypePosts24h: number;
    distinctAuthors24h: number;
    burstWindowMin: number;
    volumeRatio: number | null;
  };
};

// A dismissible amber CAUTION banner. Shown only when level !== "none".
// COMPLIANCE: neutral description of posting patterns + public volume facts.
// Never advice, never names users, never blames the company. Links to the
// filings/reality-check, not to a trade action.
export default function ManipulationRadar({ ticker }: { ticker: string }) {
  const [data, setData] = useState<RadarResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDismissed(false);
    setData(null);
    fetch(`/api/board/radar?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RadarResult | null) => {
        if (!cancelled && d && d.level && d.level !== "none") setData(d);
      })
      .catch(() => {
        /* radar is advisory — fail silent */
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!data || dismissed) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-amber-500/40 bg-amber-500/[0.06]">
      <div className="flex gap-3 p-4">
        <span aria-hidden className="mt-0.5 text-lg">⚠️</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              Heads up: unusual activity on this board
            </p>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss caution"
              className="shrink-0 rounded text-amber-600/70 hover:text-amber-700 dark:text-amber-400/70 dark:hover:text-amber-300"
            >
              ✕
            </button>
          </div>

          <p className="mt-1 text-sm leading-relaxed text-amber-800/90 dark:text-amber-200/90">
            {data.caption}
          </p>

          {data.signals.length > 0 && (
            <ul className="mt-2 space-y-1">
              {data.signals.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-amber-700/90 dark:text-amber-300/90">
                  <span aria-hidden>•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
            This describes posting patterns and public trading volume — not a judgment of the
            company and not investment advice. Check the facts for yourself before acting.
          </p>

          <a
            href={`/t/${encodeURIComponent(ticker.toUpperCase())}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
          >
            Verify against SEC filings →
          </a>
        </div>
      </div>
    </div>
  );
}

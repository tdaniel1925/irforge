"use client";

import { useEffect, useState } from "react";

type RadarLevel = "none" | "watch" | "elevated";
type Mix7d = { factual: number; opinion: number; hype: number; fud: number; chatter: number; question: number; verified: number; total: number };
type Composite = { mood: string; moodLabel: string; factors: string[]; answeredRate: number | null };
type RadarResult = {
  level: RadarLevel;
  signals: string[];
  caption: string;
  counts: {
    hypePosts24h: number;
    fudPosts24h: number;
    distinctAuthors24h: number;
    burstWindowMin: number;
    volumeRatio: number | null;
  };
  mix7d?: Mix7d;
  composite?: Composite;
};

const MOOD_STYLE: Record<string, string> = {
  quiet: "border-app text-faint",
  constructive: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  curious: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  heated: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  cautious: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
};

// Community signal strip — the AI label mix for the last 7 days, always neutral.
const MIX_ITEMS: Array<{ key: keyof Mix7d; label: string; cls: string }> = [
  { key: "factual", label: "factual", cls: "text-emerald-600 dark:text-emerald-400" },
  { key: "opinion", label: "opinion", cls: "text-sky-600 dark:text-sky-400" },
  { key: "question", label: "questions", cls: "text-app" },
  { key: "verified", label: "company answers", cls: "text-emerald-600 dark:text-emerald-400" },
  { key: "hype", label: "hype", cls: "text-amber-600 dark:text-amber-400" },
  { key: "fud", label: "fud", cls: "text-red-600 dark:text-red-400" },
];

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
        if (!cancelled && d && d.level) setData(d);
      })
      .catch(() => {
        /* radar is advisory — fail silent */
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  if (!data) return null;

  // Neutral community-signal strip (always shown when the board has recent posts):
  // measured mood + the label mix. Descriptive only — what IS, never what will be.
  const mix = data.mix7d;
  const comp = data.composite;
  const strip = mix && mix.total > 0 && (
    <div className="mb-4 rounded-xl border border-app bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Community signal · 7d</span>
        {comp && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${MOOD_STYLE[comp.mood] ?? "border-app text-app"}`}>
            {comp.moodLabel}
          </span>
        )}
        {MIX_ITEMS.filter((m) => (mix[m.key] as number) > 0).map((m) => (
          <span key={m.key} className={`text-xs font-medium ${m.cls}`}>
            {mix[m.key]} {m.label}
          </span>
        ))}
      </div>
      {comp && comp.factors.length > 0 && (
        <p className="mt-1.5 text-[11px] text-faint">
          Measured from: {comp.factors.join(" · ")} · descriptive only, not advice
        </p>
      )}
    </div>
  );

  if (data.level === "none" || dismissed) return strip || null;

  return (
    <>
    {strip}
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
    </>
  );
}

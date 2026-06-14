"use client";

import { useState } from "react";

const GRADE_RING: Record<string, string> = {
  A: "border-emerald-400 text-emerald-400",
  B: "border-sky-400 text-sky-400",
  C: "border-amber-400 text-amber-400",
  D: "border-orange-400 text-orange-400",
  F: "border-red-400 text-red-400",
};

// The on-page preview + copyable embed snippet. The actual badge image is served
// by /api/badge/[ticker].svg and updates itself; this just hands companies the code.
export default function BadgeEmbed({ ticker, grade, score }: { ticker: string; grade: string; score: number }) {
  const [copied, setCopied] = useState(false);
  const src = `https://pubcozone.com/api/badge/${ticker}.svg`;
  const href = `https://pubcozone.com/t/${ticker}`;
  const snippet = `<a href="${href}" target="_blank" rel="noopener"><img src="${src}" alt="PubcoZone Visibility Grade for $${ticker}" width="230" height="56"></a>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-semibold text-white">Put this badge on your site</h2>
        <span className="text-[11px] text-slate-500">live grade · updates itself · links back here</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {/* Live-ish preview built from the same data the SVG uses */}
        <div className="flex shrink-0 items-center gap-3 rounded-[10px] border border-slate-700 bg-[#04060c] px-4 py-2.5">
          <div className="leading-tight">
            <p className="text-sm font-bold">
              <span className="text-emerald-50">Pubco</span>
              <span className="text-emerald-400">Zone</span>
            </p>
            <p className="text-[11px] text-slate-400">${ticker} · Visibility Score</p>
          </div>
          <div className={`flex h-11 w-11 flex-col items-center justify-center rounded-full border-2 ${GRADE_RING[grade] ?? "border-slate-500 text-slate-400"}`}>
            <span className="text-lg font-extrabold leading-none">{grade}</span>
            <span className="text-[7px] text-slate-500">{score}/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <code className="block max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-400">
            {snippet}
          </code>
          <button
            onClick={copy}
            className="mt-2 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-400"
          >
            {copied ? "Copied ✓" : "Copy embed code"}
          </button>
        </div>
      </div>
    </div>
  );
}

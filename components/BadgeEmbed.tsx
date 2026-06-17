"use client";

import { useState } from "react";

const GRADE_HEX: Record<string, string> = {
  A: "#34d399",
  B: "#38bdf8",
  C: "#fbbf24",
  D: "#fb923c",
  F: "#f87171",
};

// The on-page preview + copyable embed snippet. The actual badge image is served
// by /api/badge/[ticker].svg and updates itself; this just hands companies the code.
export default function BadgeEmbed({ ticker, grade, score }: { ticker: string; grade: string; score: number }) {
  const [copied, setCopied] = useState(false);
  const src = `https://pubcozone.com/api/badge/${ticker}.svg`;
  const href = `https://pubcozone.com/t/${ticker}`;
  const snippet = `<a href="${href}" target="_blank" rel="noopener"><img src="${src}" alt="PubcoZone Visibility Grade for $${ticker}" width="248" height="60"></a>`;

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
    <div className="mt-6 rounded-xl border border-app bg-surface p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-semibold text-white">Put this badge on your site</h2>
        <span className="text-[11px] text-faint">live grade · updates itself · links back here</span>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        {/* Live-ish preview built from the same data the SVG uses */}
        {/* Inline colors throughout — the light-mode theme bridge in globals.css
            darkens emerald/white utility classes, which would turn this dark-on-dark. */}
        <div className="flex shrink-0 items-center gap-4 rounded-[11px] border border-app px-4 py-3" style={{ background: "#04060c" }}>
          <div className="leading-tight">
            <p className="text-sm font-bold">
              <span style={{ color: "#ecfdf5" }}>Pubco</span>
              <span style={{ color: "#34d399" }}>Zone</span>
            </p>
            <p className="text-[11px]" style={{ color: "#cbd5e1" }}>${ticker} · Score {score}/100</p>
          </div>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full border-[3px]"
            style={{ borderColor: GRADE_HEX[grade] ?? "#64748b", backgroundColor: `${GRADE_HEX[grade] ?? "#64748b"}1f` }}
          >
            <span className="text-xl font-extrabold leading-none" style={{ color: GRADE_HEX[grade] ?? "#94a3b8" }}>{grade}</span>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <code className="block max-w-full overflow-x-auto whitespace-nowrap rounded-lg border border-app bg-surface-2 px-3 py-2 text-[11px] text-muted">
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

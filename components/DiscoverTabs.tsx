"use client";

import Link from "next/link";
import { useState } from "react";

export interface Row {
  ticker: string;
  views: number;
  posts: number;
  posts24h: number;
  lastActivity: string | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string;
}

type TabKey = "trending" | "mostRead" | "mostActive" | "mostPosted" | "recent";

const TABS: { key: TabKey; label: string; blurb: string }[] = [
  { key: "trending", label: "🔥 Trending", blurb: "Boards with the biggest jump in posting activity right now." },
  { key: "mostRead", label: "👁️ Most Read", blurb: "The most-viewed company pages." },
  { key: "mostActive", label: "💬 Most Active", blurb: "Most board posts in the last 24 hours." },
  { key: "mostPosted", label: "📊 Most Posted", blurb: "Most board posts all-time." },
  { key: "recent", label: "🕒 Just Active", blurb: "Boards with the most recent activity." },
];

function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function vol(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

export default function DiscoverTabs(props: Record<TabKey, Row[]> & { totalTickers: number }) {
  const [tab, setTab] = useState<TabKey>("trending");
  const rows = props[tab] ?? [];
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2 sm:p-4">
      {/* Tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? "bg-emerald-500 text-white"
                : "border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto self-center pr-1 text-xs text-slate-500">{props.totalTickers} companies tracked</span>
      </div>

      <p className="mb-3 px-1 text-xs text-slate-500">{active.blurb}</p>

      {rows.length === 0 ? (
        <p className="px-1 py-8 text-center text-sm text-slate-500">Nothing here yet — check back soon.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2 font-semibold">#</th>
                <th className="px-2 py-2 font-semibold">Company</th>
                <th className="px-2 py-2 text-right font-semibold">Last</th>
                <th className="px-2 py-2 text-right font-semibold">Chg%</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Volume</th>
                <th className="px-2 py-2 text-right font-semibold">Views</th>
                <th className="px-2 py-2 text-right font-semibold">Posts 24h</th>
                <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const up = (r.changePct ?? 0) >= 0;
                return (
                  <tr key={r.ticker} className="border-b border-slate-800/60 transition hover:bg-slate-800/40">
                    <td className="px-2 py-2.5 text-slate-500">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <Link href={`/t/${r.ticker}`} className="font-semibold text-emerald-400 hover:underline">
                        ${r.ticker}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5 text-right text-slate-200">
                      {r.price != null ? `${r.currency === "USD" ? "$" : ""}${r.price.toFixed(r.price < 1 ? 4 : 2)}` : "—"}
                    </td>
                    <td className={`px-2 py-2.5 text-right font-medium ${r.changePct == null ? "text-slate-500" : up ? "text-emerald-400" : "text-red-400"}`}>
                      {r.changePct != null ? `${up ? "+" : ""}${r.changePct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="hidden px-2 py-2.5 text-right text-slate-400 sm:table-cell">{vol(r.volume)}</td>
                    <td className="px-2 py-2.5 text-right text-slate-300">{r.views.toLocaleString()}</td>
                    <td className="px-2 py-2.5 text-right">
                      {r.posts24h > 0 ? (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">{r.posts24h}</span>
                      ) : (
                        <span className="text-slate-500">0</span>
                      )}
                    </td>
                    <td className="hidden px-2 py-2.5 text-right text-slate-500 sm:table-cell">{ago(r.lastActivity)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

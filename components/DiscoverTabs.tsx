"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

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

type TabKey = "market" | "trending" | "mostRead" | "mostActive" | "mostPosted" | "recent";

const TABS: { key: TabKey; label: string; blurb: string }[] = [
  { key: "market", label: "🌐 Market Trending", blurb: "What's hot across the whole market — blended from StockTwits, Reddit, SEC filings, volume, and more. Sourced, not pump-inflated." },
  { key: "trending", label: "🔥 On PubcoZone", blurb: "Boards with the biggest jump in posting activity here right now." },
  { key: "mostRead", label: "👁️ Most Read", blurb: "The most-viewed company pages." },
  { key: "mostActive", label: "💬 Most Active", blurb: "Most board posts in the last 24 hours." },
  { key: "mostPosted", label: "📊 Most Posted", blurb: "Most board posts all-time." },
  { key: "recent", label: "🕒 Just Active", blurb: "Boards with the most recent activity." },
];

const SOURCE_STYLE: Record<string, string> = {
  StockTwits: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  Reddit: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
  EDGAR: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  Volume: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  iHub: "bg-slate-500/15 text-slate-500 dark:text-slate-300",
};

interface MarketRow {
  ticker: string;
  sources: string[];
  mentions: number | null;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  currency: string;
}

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

export default function DiscoverTabs(props: Omit<Record<TabKey, Row[]>, "market"> & { totalTickers: number }) {
  const [tab, setTab] = useState<TabKey>("market");
  const active = TABS.find((t) => t.key === tab)!;

  // Market Trending is fetched lazily (cross-market blend); the rest come from props.
  const [market, setMarket] = useState<MarketRow[] | null>(null);
  const [marketSources, setMarketSources] = useState<string[]>([]);
  const [marketLoading, setMarketLoading] = useState(false);
  useEffect(() => {
    if (tab !== "market" || market !== null) return;
    setMarketLoading(true);
    fetch("/api/trending")
      .then((r) => r.json())
      .then((j) => {
        setMarket(j.rows ?? []);
        setMarketSources(j.activeSources ?? []);
      })
      .catch(() => setMarket([]))
      .finally(() => setMarketLoading(false));
  }, [tab, market]);

  const rows = tab === "market" ? [] : (props[tab as Exclude<TabKey, "market">] ?? []);

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

      {tab === "market" ? (
        <MarketTable rows={market} loading={marketLoading} sources={marketSources} />
      ) : rows.length === 0 ? (
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

function MarketTable({ rows, loading, sources }: { rows: MarketRow[] | null; loading: boolean; sources: string[] }) {
  if (loading || rows === null) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
        Scanning the market…
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="px-1 py-8 text-center text-sm text-slate-500">Market data is taking a breather — check back shortly.</p>;
  }
  return (
    <div>
      {sources.length > 0 && (
        <p className="mb-2 px-1 text-[11px] text-slate-500">
          Live sources:{" "}
          {sources.map((s) => (
            <span key={s} className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[s] ?? "bg-slate-500/15 text-slate-400"}`}>{s}</span>
          ))}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Ticker</th>
              <th className="px-2 py-2 text-right font-semibold">Last</th>
              <th className="px-2 py-2 text-right font-semibold">Chg%</th>
              <th className="hidden px-2 py-2 text-right font-semibold sm:table-cell">Volume</th>
              <th className="px-2 py-2 font-semibold">Trending on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const up = (r.changePct ?? 0) >= 0;
              return (
                <tr key={r.ticker} className="border-b border-slate-800/60 transition hover:bg-slate-800/40">
                  <td className="px-2 py-2.5 text-slate-500">{i + 1}</td>
                  <td className="px-2 py-2.5">
                    <Link href={`/t/${r.ticker}`} className="font-semibold text-emerald-400 hover:underline">${r.ticker}</Link>
                  </td>
                  <td className="px-2 py-2.5 text-right text-slate-200">
                    {r.price != null ? `${r.currency === "USD" ? "$" : ""}${r.price.toFixed(r.price < 1 ? 4 : 2)}` : "—"}
                  </td>
                  <td className={`px-2 py-2.5 text-right font-medium ${r.changePct == null ? "text-slate-500" : up ? "text-emerald-400" : "text-red-400"}`}>
                    {r.changePct != null ? `${up ? "+" : ""}${r.changePct.toFixed(1)}%` : "—"}
                  </td>
                  <td className="hidden px-2 py-2.5 text-right text-slate-400 sm:table-cell">{vol(r.volume)}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.sources.map((s) => (
                        <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SOURCE_STYLE[s] ?? "bg-slate-500/15 text-slate-400"}`}>{s}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

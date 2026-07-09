"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Card, LoadingState, PageHeader } from "@/components/ui";

interface Metrics {
  counts: {
    investors: number | null;
    companies: number | null;
    watchlistAdds: number | null;
    tickerViews: number;
    tickersViewed: number;
    boardPosts: number | null;
    questions: number;
    questionsAnswered: number;
    reactions: number | null;
    leads: number | null;
  };
  topTickers: { ticker: string; views: number }[];
  recentMembers: { handle: string; displayName: string; profileComplete: boolean; joined: string }[];
}

// Platform-wide engagement metrics — the "how is the site actually doing" page.
export default function AdminMetrics() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/metrics")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) setError(d.error ?? "Failed.");
        else setData(d);
      })
      .catch(() => setError("Network error."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;
  if (error) return <Banner tone="error" message={error} />;
  if (!data) return null;

  const c = data.counts;
  const n = (v: number | null) => (v === null ? "—" : v.toLocaleString());

  return (
    <div>
      <PageHeader title="Platform metrics" subtitle="Engagement across the whole site — investors, views, boards, and funnels.">
        <Link href="/admin" className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-app-hover">← Admin console</Link>
      </PageHeader>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Audience</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Investor accounts" value={n(c.investors)} />
        <Stat label="Companies" value={n(c.companies)} />
        <Stat label="Watchlist adds" value={n(c.watchlistAdds)} />
        <Stat label="Report leads" value={n(c.leads)} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Traffic (ticker pages only — install Vercel Analytics for site-wide)</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Ticker page views" value={c.tickerViews.toLocaleString()} />
        <Stat label="Distinct tickers viewed" value={c.tickersViewed.toLocaleString()} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Discussion boards</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Board posts" value={n(c.boardPosts)} />
        <Stat label="Investor questions" value={c.questions.toLocaleString()} />
        <Stat label="Answered by companies" value={`${c.questionsAnswered.toLocaleString()}${c.questions > 0 ? ` (${Math.round((c.questionsAnswered / c.questions) * 100)}%)` : ""}`} />
        <Stat label="Reactions (deduped, real)" value={n(c.reactions)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold text-app">Most-viewed tickers</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app text-left text-xs text-faint"><th className="py-2 font-medium">Ticker</th><th className="py-2 text-right font-medium">Views</th></tr></thead>
            <tbody>
              {data.topTickers.map((t) => (
                <tr key={t.ticker} className="border-b border-app">
                  <td className="py-2"><Link href={`/t/${t.ticker}`} className="text-app hover:text-emerald-500">${t.ticker}</Link></td>
                  <td className="py-2 text-right text-muted">{t.views.toLocaleString()}</td>
                </tr>
              ))}
              {data.topTickers.length === 0 && <tr><td colSpan={2} className="py-6 text-center text-faint">No views yet.</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold text-app">Newest investor accounts</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app text-left text-xs text-faint"><th className="py-2 font-medium">Investor</th><th className="py-2 font-medium">Username set</th><th className="py-2 text-right font-medium">Joined</th></tr></thead>
            <tbody>
              {data.recentMembers.map((m, i) => (
                <tr key={i} className="border-b border-app">
                  <td className="py-2 text-app">@{m.handle}{m.displayName ? <span className="text-faint"> · {m.displayName}</span> : null}</td>
                  <td className="py-2">{m.profileComplete ? <span className="text-emerald-600 dark:text-emerald-400">✓</span> : <span className="text-faint">not yet</span>}</td>
                  <td className="py-2 text-right text-faint">{m.joined}</td>
                </tr>
              ))}
              {data.recentMembers.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-faint">No investor accounts yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-app">{value}</p>
    </Card>
  );
}

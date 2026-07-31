"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, LoadingState, PageHeader } from "@/components/ui";
import { SectionLabel, SoftCard, KpiBand, Kpi, MetricTile } from "@/components/admin/ui";
import type { EmailSummary } from "@/lib/emailMetrics";

interface Metrics {
  counts: {
    investors: number | null; companies: number | null; watchlistAdds: number | null;
    tickerViews: number; tickersViewed: number; boardPosts: number | null;
    questions: number; questionsAnswered: number; reactions: number | null; leads: number | null;
  };
  topTickers: { ticker: string; views: number }[];
  trending: { ticker: string; views: number }[];
  email: Record<string, number>;
  emailSummary: EmailSummary;
  recentMembers: { handle: string; displayName: string; email: string; profileComplete: boolean; joined: string }[];
}

// Platform-wide engagement metrics — the "how is the site actually doing" page.
// Back-office design system (hlpy-adapted): hero KPI band + metric tiles.
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
  const answerRate = c.questions > 0 ? Math.round((c.questionsAnswered / c.questions) * 100) : null;
  const em = data.emailSummary;

  return (
    <div>
      <PageHeader title="Platform metrics" subtitle="Engagement across the whole site — investors, views, boards, and funnels.">
        <Link href="/admin" className="rounded-lg border border-app px-4 py-2 text-sm font-semibold text-app hover:bg-app-hover">← Admin console</Link>
      </PageHeader>

      {/* Hero KPI band — the at-a-glance headline numbers. */}
      <KpiBand title="Platform at a glance">
        <Kpi value={n(c.investors)} label="Investor accounts" />
        <Kpi value={n(c.companies)} label="Companies" />
        <Kpi value={c.tickerViews.toLocaleString()} label="Ticker page views" />
        <Kpi value={c.questions.toLocaleString()} label="Investor questions" info="Root questions on public boards" />
        <Kpi value={answerRate === null ? "—" : `${answerRate}`} unit={answerRate === null ? "" : "%"} label="Answered by companies" upIsGood info="Share of questions a company replied to" />
      </KpiBand>

      {/* Audience */}
      <SectionLabel>Audience</SectionLabel>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Investor accounts" value={n(c.investors)} />
        <MetricTile label="Companies" value={n(c.companies)} />
        <MetricTile label="Watchlist adds" value={n(c.watchlistAdds)} />
        <MetricTile label="Report leads" value={n(c.leads)} />
      </div>

      {/* Traffic */}
      <SectionLabel>Traffic (ticker pages — see Vercel Analytics for site-wide visitors)</SectionLabel>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Ticker page views" value={c.tickerViews.toLocaleString()} />
        <MetricTile label="Distinct tickers viewed" value={c.tickersViewed.toLocaleString()} />
      </div>

      {/* Email deliverability — honest bucketed view (fixes the misleading raw split). */}
      {em.sent > 0 && (
        <>
          <SectionLabel>Email deliverability (Resend events)</SectionLabel>
          {em.health !== "ok" && (
            <Banner
              tone="info"
              message={
                em.health === "unknown"
                  ? `${em.sent.toLocaleString()} emails sent but no delivery confirmations received — the Resend delivery webhook may not be reaching PubcoZone. This is likely a webhook/config issue, not failed sending. Check RESEND_WEBHOOK_SECRET and the Resend webhook endpoint.`
                  : `Only ${em.resolvedRate}% of sent emails have a delivery/failure confirmation — the delivery webhook may be partly down. The delivery rate below is computed only over confirmed events.`
              }
            />
          )}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <MetricTile label="Sent" value={em.sent.toLocaleString()} />
            <MetricTile label="Delivered" value={em.delivered.toLocaleString()} trend={em.delivered > 0 ? "up" : null} upIsGood />
            <MetricTile label="Failed" value={em.failed.toLocaleString()} trend={em.failed > 0 ? "up" : null} upIsGood={false} />
            <MetricTile label="Awaiting confirmation" value={em.pending.toLocaleString()} />
          </div>
          <SoftCard className="mb-6">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
              <span className="text-sm text-muted">Delivery rate <span className="text-faint">(of confirmed)</span>: <span className="font-bold text-app">{em.deliveryRate === null ? "—" : `${em.deliveryRate}%`}</span></span>
              <span className="text-sm text-muted">Confirmation coverage: <span className="font-bold text-app">{em.resolvedRate === null ? "—" : `${em.resolvedRate}%`}</span></span>
            </div>
          </SoftCard>
        </>
      )}

      {/* Trending */}
      {data.trending.length > 0 && (
        <SoftCard className="mb-6">
          <h2 className="mb-3 font-semibold text-app">🔥 Trending tickers — last 7 days</h2>
          <div className="flex flex-wrap gap-2">
            {data.trending.map((t) => (
              <Link key={t.ticker} href={`/t/${t.ticker}`} className="rounded-full border border-app px-3 py-1 text-sm text-app hover:bg-app-hover">
                ${t.ticker} <span className="text-faint">· {t.views}</span>
              </Link>
            ))}
          </div>
        </SoftCard>
      )}

      {/* Discussion boards */}
      <SectionLabel>Discussion boards</SectionLabel>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricTile label="Board posts" value={n(c.boardPosts)} />
        <MetricTile label="Investor questions" value={c.questions.toLocaleString()} />
        <MetricTile label="Answered by companies" value={answerRate === null ? "—" : `${c.questionsAnswered} (${answerRate}%)`} />
        <MetricTile label="Reactions (deduped, real)" value={n(c.reactions)} />
      </div>

      {/* Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SoftCard>
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
        </SoftCard>

        <SoftCard>
          <h2 className="mb-3 font-semibold text-app">Newest investor accounts</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-app text-left text-xs text-faint"><th className="py-2 font-medium">Investor</th><th className="py-2 font-medium">Email</th><th className="py-2 font-medium">Username set</th><th className="py-2 text-right font-medium">Joined</th></tr></thead>
            <tbody>
              {data.recentMembers.map((m, i) => (
                <tr key={i} className="border-b border-app">
                  <td className="py-2 text-app">@{m.handle}{m.displayName ? <span className="text-faint"> · {m.displayName}</span> : null}</td>
                  <td className="py-2 text-muted">{m.email || <span className="text-faint">—</span>}</td>
                  <td className="py-2">{m.profileComplete ? <span className="text-emerald-600 dark:text-emerald-400">✓</span> : <span className="text-faint">not yet</span>}</td>
                  <td className="py-2 text-right text-faint">{m.joined}</td>
                </tr>
              ))}
              {data.recentMembers.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-faint">No investor accounts yet.</td></tr>}
            </tbody>
          </table>
        </SoftCard>
      </div>
    </div>
  );
}

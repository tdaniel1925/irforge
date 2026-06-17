"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";

const TABS = ["results", "record"] as const;
type Tab = (typeof TABS)[number];

export default function ProofPage() {
  const { db, error } = useAppState();
  const [tab, setTab] = useState<Tab>("results");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const history = db.scoreHistory;
  const first = history[0];
  const last = history[history.length - 1];
  const posted = db.drafts.filter((d) => d.status === "posted");
  const metrics = db.metrics ?? [];
  const hasMetrics = metrics.length > 0;
  const latestMetric = metrics[metrics.length - 1];
  const firstMetric = metrics[0];

  return (
    <div>
      <PageHeader
        title="Your Results"
        subtitle="Proof that this is working — your score over time, every post we sent, and a complete record of who approved what (the part your lawyers will want). Screenshot any of it for your board."
      />

      <div className="mb-5 flex gap-1 rounded-lg border border-app bg-surface-2 p-1 text-sm">
        <button onClick={() => setTab("results")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "results" ? "bg-app-hover font-medium text-app" : "text-muted hover:text-app"}`}>
          Results
        </button>
        <button onClick={() => setTab("record")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "record" ? "bg-app-hover font-medium text-app" : "text-muted hover:text-app"}`}>
          Compliance record ({db.audit.length})
        </button>
      </div>

      {tab === "results" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Big label="Visibility Score" value={last ? `${last.score} (${last.grade})` : "—"} sub={first && last ? `${last.score - first.score >= 0 ? "+" : ""}${last.score - first.score} pts since tracking began` : ""} />
            <Big label="Posts published" value={posted.length} sub="all human-approved, all disclosed" />
            <Big label="Followers" value={hasMetrics ? latestMetric.followers.toLocaleString() : "—"} sub={hasMetrics ? `${latestMetric.followers - firstMetric.followers >= 0 ? "+" : ""}${(latestMetric.followers - firstMetric.followers).toLocaleString()} over 12 weeks` : ""} />
            <Big label="Impressions (last wk)" value={hasMetrics ? latestMetric.impressions.toLocaleString() : "—"} sub={hasMetrics ? `${latestMetric.engagements.toLocaleString()} engagements` : ""} />
          </div>

          {history.length > 1 && (
            <Card>
              <h2 className="mb-2 font-semibold text-app">Score over time</h2>
              <BigTrend points={history.map((h) => h.score)} labels={history.map((h) => h.ts.slice(5, 10))} />
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-semibold text-app">Published posts</h2>
            {posted.length === 0 ? (
              <p className="py-4 text-sm text-faint">Nothing published yet — work the Do queue.</p>
            ) : (
              <ul className="space-y-2">
                {posted.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-app bg-surface-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-app">{d.title}</p>
                      <p className="text-xs text-faint">
                        posted {d.postedAt ? timeAgo(d.postedAt) : ""} · approved by {d.decidedBy ?? "—"}
                        {d.postUrl && (
                          <>
                            {" · "}
                            <a href={d.postUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">view on X ↗</a>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-semibold text-app">Weekly numbers</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-app text-left text-xs text-faint">
                    <th className="py-2 pr-4 font-medium">Week of</th>
                    <th className="py-2 pr-4 font-medium">Followers</th>
                    <th className="py-2 pr-4 font-medium">Impressions</th>
                    <th className="py-2 pr-4 font-medium">Mentions</th>
                    <th className="py-2 font-medium">Sentiment</th>
                  </tr>
                </thead>
                <tbody>
                  {[...db.metrics].reverse().slice(0, 8).map((w) => (
                    <tr key={w.weekStart} className="border-b border-app text-muted">
                      <td className="py-2 pr-4">{w.weekStart}</td>
                      <td className="py-2 pr-4">{w.followers.toLocaleString()}</td>
                      <td className="py-2 pr-4">{w.impressions.toLocaleString()}</td>
                      <td className="py-2 pr-4">{w.mentions}</td>
                      <td className="py-2">{w.sentimentScore.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <p className="mb-3 text-xs text-faint">
            Append-only. Every draft, decision, publish, block, and setting change — this is the report you hand a regulator or exchange.
          </p>
          {db.audit.length === 0 ? (
            <EmptyState message="No events yet." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-app text-left text-xs text-faint">
                  <th className="py-2 pr-4 font-medium">Timestamp (UTC)</th>
                  <th className="py-2 pr-4 font-medium">Actor</th>
                  <th className="py-2 pr-4 font-medium">Action</th>
                  <th className="py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {db.audit.map((e) => (
                  <tr key={e.id} className="border-b border-app align-top">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-faint">{e.ts.replace("T", " ").slice(0, 19)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-muted">{e.actor}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${e.action.includes("BLOCKED") || e.action.includes("REFUSED") || e.action.includes("FAILED") ? "bg-red-500/15 text-red-600 dark:text-red-300" : e.action === "PUBLISHED" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-app-hover text-muted"}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="py-2.5 text-muted">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Card>
      <p className="text-xs text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-app">{value}</p>
      <p className="mt-1 text-xs text-faint">{sub}</p>
    </Card>
  );
}

function BigTrend({ points, labels }: { points: number[]; labels: string[] }) {
  const W = 720;
  const H = 160;
  const pad = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const pts = points.map((v, i) => ({
    x: pad + (i / (points.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2),
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <path d={area} fill="#34d399" opacity={0.1} />
      <path d={path} fill="none" stroke="#34d399" strokeWidth={2.5} />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill="#34d399" />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">{points[i]}</text>
          <text x={p.x} y={H - 6} textAnchor="middle" fontSize={9} fill="#475569">{labels[i]}</text>
        </g>
      ))}
    </svg>
  );
}

"use client";

import { useAppState } from "@/components/useAppState";
import { Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { WeeklyMetric } from "@/lib/types";

export default function MetricsPage() {
  const { db, error } = useAppState();

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const m = db.metrics;
  const latest = m[m.length - 1];
  const first = m[0];
  const postedCount = db.drafts.filter((d) => d.status === "posted").length;
  const backRatio = first.followers > 0 ? ((latest.followers - first.followers) / first.followers) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Results"
        subtitle="Your numbers, updated weekly — forward this to the board as proof the IR budget is working."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Big label="Followers" value={latest.followers.toLocaleString()} sub={`${backRatio >= 0 ? "+" : ""}${backRatio.toFixed(0)}% over 12 weeks`} />
        <Big label="Impressions (last week)" value={latest.impressions.toLocaleString()} sub={`${latest.engagements.toLocaleString()} engagements`} />
        <Big label="Sentiment score" value={latest.sentimentScore.toFixed(2)} sub="-1 (negative) to +1 (positive)" />
        <Big label="Posts published" value={postedCount} sub="all human-approved, all disclosed" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Follower growth (12 weeks)" data={m} pick={(w) => w.followers} color="#34d399" />
        <ChartCard title="Weekly impressions" data={m} pick={(w) => w.impressions} color="#38bdf8" />
        <ChartCard title="Ticker mentions per week" data={m} pick={(w) => w.mentions} color="#fbbf24" />
        <ChartCard title="Sentiment trend" data={m} pick={(w) => w.sentimentScore} color="#a78bfa" decimals={2} />
      </div>

      <Card className="mt-6">
        <h2 className="mb-3 font-semibold text-white">Weekly detail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="py-2 pr-4 font-medium">Week of</th>
                <th className="py-2 pr-4 font-medium">Followers</th>
                <th className="py-2 pr-4 font-medium">Impressions</th>
                <th className="py-2 pr-4 font-medium">Engagements</th>
                <th className="py-2 pr-4 font-medium">Mentions</th>
                <th className="py-2 font-medium">Sentiment</th>
              </tr>
            </thead>
            <tbody>
              {[...m].reverse().map((w) => (
                <tr key={w.weekStart} className="border-b border-slate-900 text-slate-300">
                  <td className="py-2 pr-4">{w.weekStart}</td>
                  <td className="py-2 pr-4">{w.followers.toLocaleString()}</td>
                  <td className="py-2 pr-4">{w.impressions.toLocaleString()}</td>
                  <td className="py-2 pr-4">{w.engagements.toLocaleString()}</td>
                  <td className="py-2 pr-4">{w.mentions}</td>
                  <td className="py-2">{w.sentimentScore.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </Card>
  );
}

function ChartCard({
  title,
  data,
  pick,
  color,
  decimals = 0,
}: {
  title: string;
  data: WeeklyMetric[];
  pick: (w: WeeklyMetric) => number;
  color: string;
  decimals?: number;
}) {
  const values = data.map(pick);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 560;
  const H = 140;
  const pad = 8;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - pad * 2);
    const y = H - pad - ((v - min) / range) * (H - pad * 2);
    return { x, y };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${path} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;

  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-semibold text-white">{title}</h2>
        <span className="text-xs text-slate-500">
          {min.toFixed(decimals)} – {max.toFixed(decimals)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <path d={area} fill={color} opacity={0.12} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
        ))}
      </svg>
    </Card>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Point = { t: number; c: number; v: number };
const RANGES = ["1D", "5D", "1M", "6M", "1Y", "5Y", "MAX"] as const;
type Range = (typeof RANGES)[number];

const LABEL: Record<Range, string> = { "1D": "1D", "5D": "5D", "1M": "1M", "6M": "6M", "1Y": "1Y", "5Y": "5Y", MAX: "Max" };

// Over long horizons a stock can be up thousands of % — show that as a multiple
// (e.g. +3,215x) instead of an unreadable percentage.
function fmtChange(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  if (Math.abs(pct) >= 1000) return `${sign}${Math.round(pct / 100).toLocaleString()}x`;
  return `${sign}${pct.toFixed(1)}%`;
}

export default function StockChart({
  ticker,
  currency = "USD",
}: {
  ticker: string;
  currency?: string;
}) {
  // The default range fetches on mount; results are cached server-side (15 min),
  // so switching ranges is near-instant after the first hit.
  const [range, setRange] = useState<Range>("6M");
  const [data, setData] = useState<Record<string, { points: Point[]; changePct: number | null }>>({});
  const [loading, setLoading] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const cache = useRef(data);
  cache.current = data;

  useEffect(() => {
    if (cache.current[range]) return; // already have it
    let cancelled = false;
    setLoading(true);
    fetch(`/api/chart/${encodeURIComponent(ticker)}?range=${range}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setData((d) => ({ ...d, [range]: { points: j.points ?? [], changePct: j.changePct ?? null } }));
      })
      .catch(() => {
        if (!cancelled) setData((d) => ({ ...d, [range]: { points: [], changePct: null } }));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [range, ticker]);

  const current = data[range];
  const points = current?.points ?? [];
  const up = (current?.changePct ?? 0) >= 0;
  const color = up ? "#34d399" : "#f87171";

  const geo = useMemo(() => {
    const W = 760, H = 220, pad = 8, volH = 46, gap = 8;
    const priceH = H - volH - gap;
    if (points.length < 2) return null;
    const cs = points.map((p) => p.c);
    const min = Math.min(...cs), max = Math.max(...cs), range = max - min || 1;
    const vmax = Math.max(...points.map((p) => p.v), 1);
    const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
    const y = (c: number) => pad + (priceH - pad * 2) - ((c - min) / range) * (priceH - pad * 2) + pad;
    const linePts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.c).toFixed(1)}`);
    const line = linePts.map((s, i) => `${i === 0 ? "M" : "L"}${s}`).join(" ");
    const area = `${line} L${x(points.length - 1).toFixed(1)},${priceH} L${x(0).toFixed(1)},${priceH} Z`;
    const bars = points.map((p, i) => ({
      x: x(i),
      h: (p.v / vmax) * volH,
      w: Math.max(1, (W - pad * 2) / points.length - 1),
    }));
    return { W, H, pad, priceH, volH, gap, x, y, line, area, bars, min, max };
  }, [points]);

  const hoverPoint = hover !== null && points[hover] ? points[hover] : null;

  return (
    <div className="mt-4">
      {/* Range tabs */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              range === r
                ? "bg-emerald-500 text-white"
                : "border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {LABEL[r]}
          </button>
        ))}
        {current?.changePct != null && (
          <span className={`ml-auto self-center text-sm font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
            {fmtChange(current.changePct)} · {LABEL[range]}
          </span>
        )}
      </div>

      <div className="relative">
        {loading && !geo && (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
            <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
            loading {LABEL[range]}…
          </div>
        )}

        {!loading && !geo && (
          <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
            No price history for this range.
          </div>
        )}

        {geo && (
          <>
            {loading && (
              <span className="absolute right-0 top-0 z-10 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-600 border-t-emerald-400" />
            )}
            <svg
              viewBox={`0 0 ${geo.W} ${geo.H}`}
              className="w-full"
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
                const rel = ((e.clientX - rect.left) / rect.width) * geo.W;
                const i = Math.round(((rel - geo.pad) / (geo.W - geo.pad * 2)) * (points.length - 1));
                setHover(Math.max(0, Math.min(points.length - 1, i)));
              }}
            >
              {/* price area + line */}
              <path d={geo.area} fill={color} opacity={0.08} />
              <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {/* volume bars */}
              <g opacity={0.5}>
                {geo.bars.map((b, i) => (
                  <rect key={i} x={b.x - b.w / 2} y={geo.priceH + geo.gap + (geo.volH - b.h)} width={b.w} height={b.h} fill="#64748b" />
                ))}
              </g>
              {/* hover crosshair */}
              {hover !== null && points[hover] && (
                <>
                  <line x1={geo.x(hover)} y1={geo.pad} x2={geo.x(hover)} y2={geo.priceH} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
                  <circle cx={geo.x(hover)} cy={geo.y(points[hover].c)} r={3.5} fill={color} stroke="#04060c" strokeWidth={1.5} />
                </>
              )}
            </svg>

            {/* hover readout */}
            <div className="mt-1 h-5 text-center text-xs text-slate-400">
              {hoverPoint ? (
                <>
                  <span className="font-semibold text-slate-200">
                    {currency === "USD" ? "$" : ""}
                    {hoverPoint.c.toFixed(hoverPoint.c < 1 ? 4 : 2)}
                    {currency !== "USD" ? ` ${currency}` : ""}
                  </span>
                  {hoverPoint.v > 0 && <span className="ml-3">vol {(hoverPoint.v / 1e6).toFixed(2)}M</span>}
                  {hoverPoint.t > 1e6 && (
                    <span className="ml-3 text-slate-500">{new Date(hoverPoint.t * 1000).toLocaleDateString()}</span>
                  )}
                </>
              ) : (
                <span className="text-slate-600">hover the chart for price &amp; volume</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

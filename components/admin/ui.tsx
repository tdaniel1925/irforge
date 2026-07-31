"use client";

// ── Back-Office design system (hlpy-adapted, PubcoZone brand) ──
// Layout ideas borrowed from the hlpy reference — soft rounded KPI cards, a tinted
// hero KPI band, big-number metric tiles with up/down trend arrows, quiet section
// headers — rendered in PubcoZone's own emerald/navy tokens so the console stays
// consistent with Compose/Posts/CRM. Used across every /admin page.

import type { ReactNode } from "react";

// Section label — small, uppercase, muted (the "AUDIENCE" / "MISSIONI" headers).
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{children}</h2>;
}

// A soft rounded card — the base surface for the console (larger radius + softer
// shadow than the app-wide Card, matching the reference).
export function SoftCard({ children, className = "", tone = "plain" }: { children: ReactNode; className?: string; tone?: "plain" | "mint" | "violet" }) {
  const toneCls = {
    plain: "bg-surface border-app",
    mint: "bg-emerald-500/[0.07] border-emerald-500/20",
    violet: "bg-indigo-500/[0.06] border-indigo-500/20",
  }[tone];
  return <div className={`rounded-2xl border ${toneCls} p-5 shadow-sm ${className}`}>{children}</div>;
}

export type Trend = "up" | "down" | null;

// Direction arrow. "good" says whether up is good (green) — so e.g. a rising
// FAILURE count shows a red up-arrow, a rising delivered count shows green.
function TrendArrow({ trend, good = true }: { trend: Trend; good?: boolean }) {
  if (!trend) return null;
  const isGood = (trend === "up") === good;
  const color = isGood ? "text-emerald-500" : "text-red-500";
  return <span className={`text-base leading-none ${color}`} aria-label={trend === "up" ? "up" : "down"}>{trend === "up" ? "↑" : "↓"}</span>;
}

// Big-number KPI tile (the hero band metrics: "36 min ↓", "45 ↑"). value + unit +
// label, with an optional trend arrow and an optional info tooltip.
export function Kpi({ value, unit, label, trend = null, upIsGood = true, info }: {
  value: string | number; unit?: string; label: string; trend?: Trend; upIsGood?: boolean; info?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold tracking-tight text-app">{value}</span>
        {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
        <TrendArrow trend={trend} good={upIsGood} />
      </div>
      <p className="flex items-center gap-1 text-xs text-muted" title={info}>
        {label}
        {info && <span className="text-faint" aria-hidden>ⓘ</span>}
      </p>
    </div>
  );
}

// Metric tile as its own card (the "TODAY / YESTERDAY / LAST WEEK" cards). Rounded
// card, optional icon chip, big number, up/down arrow.
export function MetricTile({ label, value, icon, trend = null, upIsGood = true, href }: {
  label: string; value: string | number; icon?: ReactNode; trend?: Trend; upIsGood?: boolean; href?: string;
}) {
  const inner = (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-app bg-surface p-5 text-center shadow-sm transition hover:border-emerald-500/40">
      {icon && <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">{icon}</span>}
      <p className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold tracking-tight text-app">{value}</span>
        <TrendArrow trend={trend} good={upIsGood} />
      </div>
    </div>
  );
  if (href) return <a href={href} className="block">{inner}</a>;
  return inner;
}

// The tinted hero KPI band — a mint rounded panel holding a row of Kpi tiles,
// with a title/period selector slot (like "KPI Fornitore · LAST 3 MONTHS").
export function KpiBand({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <SoftCard tone="mint" className="mb-6">
      {(title || right) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <p className="text-sm font-bold text-app">{title}</p>}
          {right}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">{children}</div>
    </SoftCard>
  );
}

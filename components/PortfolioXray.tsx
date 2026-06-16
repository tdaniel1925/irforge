import Link from "next/link";
import type { PortfolioXray as PortfolioXrayData } from "@/lib/portfolioXray";

// Facts-only portfolio x-ray view. Renders neutral public figures + fact flags
// for each watched ticker. NO advice, NO scoring, NO ranking. "Here's what the
// filings say." Tickers not in the snapshot are listed separately by the page.

const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${Math.round(v)}%`);
const fmtNum = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);
const fmtRunway = (v: number | null) => (v == null ? "—" : `${Math.round(v * 10) / 10}q`);

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-faint">{label}</div>
      <div className={`text-sm font-semibold ${muted ? "text-muted" : "text-app"}`}>{value}</div>
    </div>
  );
}

export default function PortfolioXray({
  data,
  missing = [],
  narrative,
}: {
  data: PortfolioXrayData;
  missing?: string[];
  narrative?: string;
}) {
  const { holdings, portfolio } = data;

  return (
    <div className="space-y-6">
      {/* Compliance disclaimer — always visible */}
      <div className="rounded-xl border border-app bg-surface-2 p-4">
        <p className="text-sm text-app">
          <span className="font-semibold">Facts and research, not advice.</span> This x-ray reports
          public figures from filings and market data across the tickers you watch. It does not
          recommend buying, selling, or trimming any position, and it does not rank or score your
          holdings.
        </p>
      </div>

      {/* Portfolio-level neutral fact notes */}
      {portfolio.count > 0 && (
        <div className="rounded-xl border border-app bg-surface p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="In snapshot" value={String(portfolio.count)} />
            <Stat label="Diluting 20%+ / 1y" value={String(portfolio.dilutingCount)} />
            <Stat label="Runway < 4q" value={String(portfolio.lowRunwayCount)} />
            <Stat label="Short ≥ 20%" value={String(portfolio.highShortCount)} />
          </div>
          {portfolio.notes.length > 0 && (
            <ul className="mt-4 space-y-1 border-t border-app pt-3">
              {portfolio.notes.map((n, i) => (
                <li key={i} className="text-sm text-muted">{n}</li>
              ))}
            </ul>
          )}
          {narrative && (
            <p className="mt-3 border-t border-app pt-3 text-sm text-muted">{narrative}</p>
          )}
        </div>
      )}

      {/* Per-holding facts */}
      {holdings.length > 0 ? (
        <div className="space-y-3">
          {holdings.map((h) => (
            <div key={h.ticker} className="rounded-xl border border-app bg-surface p-4">
              <div className="flex items-center justify-between">
                <Link
                  href={`/t/${h.ticker}`}
                  className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  ${h.ticker}
                </Link>
                {h.companyName && <span className="text-xs text-faint">{h.companyName}</span>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Stat label="Dilution 1y" value={fmtPct(h.dilutionPct1y)} />
                <Stat label="Runway" value={fmtRunway(h.runwayQuarters)} />
                <Stat label="Short %" value={fmtNum(h.shortPct, "%")} />
                <Stat label="Insider net" value={fmtNum(h.insiderNet)} />
                <Stat label="Volume vs avg" value={fmtNum(h.volumeRatio, "x")} />
              </div>

              {h.flags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {h.flags.map((f, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-app bg-app-hover px-2.5 py-1 text-xs text-app"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-app p-10 text-center">
          <p className="text-sm font-medium text-app">No watched tickers are in our data snapshot yet.</p>
          <p className="mt-1 text-sm text-muted">
            Our snapshot covers the screener universe and refreshes nightly.
          </p>
        </div>
      )}

      {/* Tickers with no snapshot row */}
      {missing.length > 0 && (
        <div className="rounded-xl border border-app bg-surface p-4">
          <p className="text-sm font-medium text-app">Not yet in our data snapshot</p>
          <p className="mt-1 text-xs text-muted">
            These watched tickers aren&apos;t in the screener universe snapshot, so no figures are available here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {missing.map((t) => (
              <Link
                key={t}
                href={`/t/${t}`}
                className="rounded-full border border-app bg-surface-2 px-2.5 py-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                ${t}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

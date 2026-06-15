import { getPublicTickerAudit } from "@/lib/tickerCache";
import StockChart from "@/components/StockChart";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Full embeddable investor hub — a clean, IR-focused slice of the ticker report
// that a company drops onto ir.theirsite.com via <iframe>. Becomes their IR page.
export default async function HubEmbed({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase().slice(0, 8);
  let audit;
  try {
    audit = await getPublicTickerAudit(ticker);
  } catch {
    audit = null;
  }

  if (!audit) {
    return <div style={{ fontFamily: "system-ui", padding: 24, color: "#64748b" }}>Live data for ${ticker} is loading — refresh in a moment.</div>;
  }

  const f = audit.fundamentals;
  const money = (n?: number) => (typeof n === "number" ? (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`) : "—");

  const stats: [string, string][] = [
    ["Price", typeof audit.market.price === "number" ? `$${audit.market.price.toFixed(2)}` : "—"],
    ["Cash", money(f?.cash)],
    ["Shares out", typeof f?.sharesOutstanding === "number" ? `${(f.sharesOutstanding / 1e6).toFixed(0)}M` : "—"],
    ["Short vol", audit.shortData ? `${audit.shortData.shortPct.toFixed(0)}%` : "—"],
    ["SEC filings (12mo)", String(audit.filings.last12mo ?? 0)],
    ["Visibility grade", audit.grade],
  ];

  return (
    <div className="bg-app text-app" style={{ minHeight: "100vh", padding: "24px 20px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold text-app">
            ${audit.ticker}{audit.companyName && <span className="ml-2 text-base font-normal text-muted">{audit.companyName}</span>}
          </h1>
          <span className="text-xs text-faint">Investor information</span>
        </div>

        {/* key stats */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-app bg-surface p-3">
              <p className="text-xs text-faint">{k}</p>
              <p className="mt-0.5 text-lg font-bold text-app">{v}</p>
            </div>
          ))}
        </div>

        {/* chart */}
        <div className="mt-5 rounded-xl border border-app bg-surface p-4">
          <p className="mb-1 text-sm font-semibold text-app">Stock price</p>
          <StockChart ticker={audit.ticker} currency={audit.market.currency} />
        </div>

        {/* recent filings */}
        {audit.recentFilings.length > 0 && (
          <div className="mt-5 rounded-xl border border-app bg-surface p-4">
            <p className="mb-2 text-sm font-semibold text-app">Recent SEC filings</p>
            <ul className="space-y-1.5">
              {audit.recentFilings.slice(0, 6).map((fl, i) => (
                <li key={i} className="flex items-baseline gap-3 text-sm">
                  <span className="shrink-0 text-xs text-faint">{fl.date}</span>
                  <span className="shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">{fl.form}</span>
                  <a href={fl.url} target="_blank" rel="noreferrer" className="truncate text-emerald-600 hover:underline dark:text-emerald-400">{fl.title}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-5 text-center text-xs text-faint">
          Live public data · <a href={`https://pubcozone.com/t/${ticker}`} target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400">Full report on PubcoZone ↗</a>
        </p>
      </div>
    </div>
  );
}

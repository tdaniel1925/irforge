"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, PageHeader } from "@/components/ui";
import type { TickerAudit } from "@/lib/audit";

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/40",
  B: "text-sky-400 border-sky-500/40",
  C: "text-amber-400 border-amber-500/40",
  D: "text-orange-400 border-orange-500/40",
  F: "text-red-400 border-red-500/40",
};

export default function TickerAuditPage() {
  const { db } = useAppState();
  const [ticker, setTicker] = useState("");
  const [peers, setPeers] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<TickerAudit | null>(null);

  const run = async (tOverride?: string) => {
    const t = (tOverride ?? ticker).trim();
    if (!t) {
      setError("Enter a ticker symbol first — try the one your prospect is sitting across the table from.");
      return;
    }
    setRunning(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/ticker-audit?ticker=${encodeURIComponent(t)}&peers=${encodeURIComponent(peers)}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Audit failed.");
      else setReport(data);
    } catch {
      setError("Network error — are you online?");
    } finally {
      setRunning(false);
    }
  };

  const useMyCompany = () => {
    if (!db) return;
    setTicker(db.company.ticker);
    setPeers(db.company.peers.join(", "));
  };

  const ratedTotal = report ? report.social.bullish + report.social.bearish : 0;
  const bullPct = report && ratedTotal > 0 ? Math.round((report.social.bullish / ratedTotal) * 100) : null;

  return (
    <div>
      <PageHeader
        title="Ticker Audit"
        subtitle="Type any ticker and get a live intelligence report from SEC EDGAR, StockTwits, and Reddit — real public data, scanned right now. This is the demo that sells PubcoZone."
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Ticker</label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. LAC"
              className="w-36 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">Peer tickers to compare (optional, comma-separated)</label>
            <input
              value={peers}
              onChange={(e) => setPeers(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="e.g. SGML, LAC, ALB"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm uppercase text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <Button onClick={() => run()} disabled={running}>
            {running ? "Scanning live sources…" : "✦ Run audit"}
          </Button>
          <Button variant="ghost" onClick={useMyCompany} title="Fill in your company's ticker and peers from Settings">
            Use my company
          </Button>
        </div>
        {running && (
          <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Checking SEC EDGAR, StockTwits, and Reddit in parallel — usually under 15 seconds…
          </p>
        )}
      </Card>

      {error && <Banner message={error} tone="error" onDismiss={() => setError(null)} />}

      {report && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center gap-6">
              <div className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border-2 text-5xl font-bold ${GRADE_COLOR[report.grade]}`}>
                {report.grade}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-semibold text-white">
                  ${report.ticker}
                  {report.companyName && <span className="ml-2 text-base font-normal text-slate-400">{report.companyName}</span>}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Investor-visibility score: <span className="font-semibold text-white">{report.score}/100</span> · generated{" "}
                  {new Date(report.generatedAt).toLocaleTimeString()} from live public data
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {report.sources.map((s) => (
                    <span
                      key={s.name}
                      title={s.note}
                      className={`rounded-full border px-2 py-0.5 text-[11px] ${
                        s.ok ? "border-emerald-500/30 text-emerald-300" : "border-red-500/30 text-red-300"
                      }`}
                    >
                      {s.ok ? "✓" : "✕"} {s.name}
                      {!s.ok && s.note ? ` — ${s.note}` : ""}
                    </span>
                  ))}
                </div>
              </div>
              <a
                href={`/t/${report.ticker}${peers.trim() ? `?peers=${encodeURIComponent(peers.replace(/\s/g, ""))}` : ""}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-lg border border-slate-700 px-3.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
                title="Opens the shareable public version of this report"
              >
                ↗ Open public page
              </a>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Metric label="StockTwits watchers" value={report.social.watchers?.toLocaleString() ?? "—"} />
            <Metric label="Messages per day" value={report.social.msgsPerDay !== undefined ? report.social.msgsPerDay.toFixed(1) : "—"} />
            <Metric label="Bullish sentiment" value={bullPct !== null ? `${bullPct}%` : "not enough data"} />
            <Metric label="SEC filings (12 mo)" value={report.filings.last12mo} sub={report.filings.lastForm ? `latest: ${report.filings.lastForm} on ${report.filings.lastFilingDate}` : undefined} />
            <Metric label="News articles (30 days)" value={report.sources.find((s) => s.name === "News (GDELT)")?.ok ? report.news.articles30d : "—"} sub={report.news.topOutlets.length > 0 ? `top: ${report.news.topOutlets.slice(0, 2).join(", ")}` : undefined} />
            <Metric
              label="Volume vs 3-mo avg"
              value={
                typeof report.market.lastVolume === "number" && typeof report.market.avgVolume3mo === "number" && report.market.avgVolume3mo > 0
                  ? `${Math.round((report.market.lastVolume / report.market.avgVolume3mo) * 100)}%`
                  : "—"
              }
              sub={typeof report.market.changePct3mo === "number" ? `price ${report.market.changePct3mo >= 0 ? "+" : ""}${report.market.changePct3mo.toFixed(1)}% over 3 months` : undefined}
            />
            <Metric
              label="Short volume (FINRA)"
              value={report.shortData ? `${report.shortData.shortPct.toFixed(0)}%` : "—"}
              sub={report.shortData ? `of daily volume sold short · ${report.shortData.venue}` : "not in FINRA files"}
            />
            <Metric
              label="Cash / runway"
              value={typeof report.fundamentals?.cash === "number" ? `$${(report.fundamentals.cash / 1e6).toFixed(1)}M` : "—"}
              sub={typeof report.fundamentals?.runwayQuarters === "number" ? `~${report.fundamentals.runwayQuarters.toFixed(1)} quarters at current loss rate` : typeof report.fundamentals?.netIncomeAnnual === "number" && report.fundamentals.netIncomeAnnual >= 0 ? "profitable" : undefined}
            />
            <Metric
              label="Dilution (1 yr)"
              value={typeof report.fundamentals?.sharesChangePct1y === "number" ? `${report.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${report.fundamentals.sharesChangePct1y.toFixed(0)}%` : "—"}
              sub="change in shares outstanding"
            />
            <Metric
              label="Insiders (180d)"
              value={report.insiders ? `${report.insiders.buys} buys / ${report.insiders.sells} sells` : "—"}
              sub={report.insiders ? `${report.insiders.form4Count180d} Form 4 filings` : undefined}
            />
            <Metric label="Wikipedia views (30d)" value={report.wiki ? report.wiki.views30d.toLocaleString() : "—"} sub={report.wiki?.title} />
            <Metric
              label="Catalysts"
              value={report.catalysts?.trials ? `${report.catalysts.trials.total} trials` : report.catalysts?.contracts ? `${report.catalysts.contracts.count} contracts` : "none found"}
              sub={report.catalysts?.contracts && report.catalysts.contracts.totalAmount > 0 ? `$${(report.catalysts.contracts.totalAmount / 1e6).toFixed(1)}M federal awards` : "ClinicalTrials + USAspending"}
            />
          </div>

          <Card>
            <h3 className="mb-3 font-semibold text-white">What we found</h3>
            <ul className="space-y-2">
              {report.findings.map((f, i) => (
                <li key={i} className="flex gap-2 text-sm text-slate-300">
                  <span className="text-emerald-400">▸</span>
                  {f}
                </li>
              ))}
              {report.findings.length === 0 && <li className="text-sm text-slate-500">Not enough data returned to draw conclusions — try again in a minute (sources rate-limit).</li>}
            </ul>
          </Card>

          {report.peers.length > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold text-white">vs. peers</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="py-2 pr-4 font-medium">Ticker</th>
                    <th className="py-2 pr-4 font-medium">Watchers</th>
                    <th className="py-2 font-medium">Messages/day</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-900 bg-emerald-500/5 font-medium text-white">
                    <td className="py-2 pr-4">${report.ticker} (you)</td>
                    <td className="py-2 pr-4">{report.social.watchers?.toLocaleString() ?? "—"}</td>
                    <td className="py-2">{report.social.msgsPerDay?.toFixed(1) ?? "—"}</td>
                  </tr>
                  {report.peers.map((p) => (
                    <tr key={p.ticker} className="border-b border-slate-900 text-slate-300">
                      <td className="py-2 pr-4">${p.ticker}</td>
                      <td className="py-2 pr-4">{p.error ? "—" : p.watchers?.toLocaleString() ?? "—"}</td>
                      <td className="py-2">{p.error ? "—" : p.msgsPerDay?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {report.social.topAccounts.length > 0 && (
            <Card>
              <h3 className="mb-1 font-semibold text-white">Influencer leads — accounts already talking about ${report.ticker}</h3>
              <p className="mb-3 text-xs text-slate-500">
                Sorted by audience size. These are the warmest outreach targets: they already cover this ticker. Your team reaches out — PubcoZone never contacts anyone on your behalf.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="py-2 pr-4 font-medium">Account</th>
                    <th className="py-2 pr-4 font-medium">Followers</th>
                    <th className="py-2 pr-4 font-medium">Posts in feed</th>
                    <th className="py-2 font-medium">Latest message</th>
                  </tr>
                </thead>
                <tbody>
                  {report.social.topAccounts.map((a) => (
                    <tr key={a.username} className="border-b border-slate-900 align-top text-slate-300">
                      <td className="whitespace-nowrap py-2 pr-4 font-medium text-white">@{a.username}</td>
                      <td className="py-2 pr-4">{a.followers.toLocaleString()}</td>
                      <td className="py-2 pr-4">{a.ideas}</td>
                      <td className="py-2 text-xs text-slate-400">{a.lastMessage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {report.news.samples.length > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold text-white">Recent news coverage</h3>
              <ul className="space-y-2">
                {report.news.samples.map((n, i) => (
                  <li key={i} className="flex items-baseline gap-3 text-sm">
                    <span className="shrink-0 text-xs text-slate-500">{n.date}</span>
                    <span className="text-slate-300">{n.title}</span>
                    <span className="shrink-0 text-xs text-slate-500">{n.outlet}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h3 className="mb-3 font-semibold text-white">Reddit footprint</h3>
            {!report.sources.find((s) => s.name === "Reddit")?.ok ? (
              <p className="text-sm text-slate-500">Reddit couldn&apos;t be reached just now (it rate-limits aggressively) — run the audit again in a minute.</p>
            ) : report.reddit.postsFound === 0 ? (
              <p className="text-sm text-slate-500">No Reddit posts found mentioning ${report.ticker} in the past year — an untouched channel.</p>
            ) : (
              <>
                <p className="mb-3 text-sm text-slate-400">
                  {report.reddit.postsFound} posts in the past year · most active: {report.reddit.topSubreddits.join(", ")}
                </p>
                <ul className="space-y-2">
                  {report.reddit.samples.map((p, i) => (
                    <li key={i} className="flex items-baseline gap-3 text-sm">
                      <span className="shrink-0 text-xs text-slate-500">▲ {p.ups}</span>
                      <span className="text-slate-300">{p.title}</span>
                      <span className="shrink-0 text-xs text-slate-500">{p.subreddit}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </div>
      )}

      {!report && !running && (
        <Card className="border-dashed">
          <p className="text-sm text-slate-500">
            The sales move: ask a prospect for their ticker, run this in front of them, and let the grade do the talking.
            Try it now with a real ticker — for example <button onClick={() => { setTicker("LAC"); setPeers("SGML, ALB, SQM"); run("LAC"); }} className="text-emerald-400 hover:underline">run $LAC vs. its lithium peers</button>.
          </p>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </Card>
  );
}

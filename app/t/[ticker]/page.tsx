import type { Metadata } from "next";
import Link from "next/link";
import { getPublicTickerAudit } from "@/lib/tickerCache";
import { generateTickerExplainer } from "@/lib/ai";
import { bumpViews } from "@/lib/publicStats";
import { getDb } from "@/lib/db";
import ClaimCard from "@/components/ClaimCard";
import AskCompany from "@/components/AskCompany";
import MessageBoard from "@/components/MessageBoard";
import TickerTabs from "@/components/TickerTabs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Props {
  params: { ticker: string };
  searchParams: { peers?: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = params.ticker.toUpperCase();
  return {
    title: `$${t} — Investor Visibility Report | PubcoZone`,
    description: `Live investor-visibility intelligence on $${t}: SEC filings, social sentiment, news coverage, and trading pulse — aggregated from public sources in real time.`,
  };
}

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-400 border-emerald-500/40",
  B: "text-sky-400 border-sky-500/40",
  C: "text-amber-400 border-amber-500/40",
  D: "text-orange-400 border-orange-500/40",
  F: "text-red-400 border-red-500/40",
};

export default async function PublicTickerPage({ params, searchParams }: Props) {
  const ticker = params.ticker.toUpperCase().slice(0, 8);
  const peers = (searchParams.peers ?? "").split(",").map((p) => p.trim()).filter(Boolean).slice(0, 5);

  let audit;
  try {
    audit = await getPublicTickerAudit(ticker, peers);
  } catch {
    audit = null;
  }

  if (!audit) {
    return (
      <PageShell>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <p className="text-red-300">All public data sources were unreachable for ${ticker}. Try again in a minute.</p>
        </div>
      </PageShell>
    );
  }

  const explainer = await generateTickerExplainer(audit);
  const viewCount = bumpViews(ticker);
  const db = getDb();
  const claimed = db.company.ticker.toUpperCase() === ticker;
  const tickerQuestions = db.publicQuestions.filter((q) => q.ticker === ticker).slice(0, 10);
  // Company-provided disclosures (OTC/SEDAR) only show on the claimed company's own page.
  const companyFilings = claimed ? db.filings.filter((f) => f.source === "company").slice(0, 6) : [];
  const rated = audit.social.bullish + audit.social.bearish;
  const bullPct = rated > 0 ? Math.round((audit.social.bullish / rated) * 100) : null;
  const anySourceOk = audit.sources.some((s) => s.ok);
  const questionCount = audit.social.recentMessages.filter((m) => m.body.includes("?")).length;

  return (
    <PageShell>
      {/* Hero */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-2xl border-2 ${GRADE_COLOR[audit.grade]}`}>
            <span className="text-4xl font-bold">{audit.grade}</span>
            <span className="text-[11px] text-slate-400">{audit.score}/100</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-white">
                ${audit.ticker}
                {audit.companyName && <span className="ml-3 text-lg font-normal text-slate-400">{audit.companyName}</span>}
              </h1>
              <a href="#claim" className="rounded-full border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold tracking-wide text-amber-400 hover:bg-amber-500/20">
                UNCLAIMED
              </a>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Investor Visibility Report · generated {new Date(audit.generatedAt).toLocaleString()} from live public sources ·{" "}
              <span className="text-slate-300">viewed {viewCount.toLocaleString()} time{viewCount === 1 ? "" : "s"}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {audit.sources.map((s) => (
                <span key={s.name} className={`rounded-full border px-2 py-0.5 text-[11px] ${s.ok ? "border-emerald-500/30 text-emerald-300" : "border-slate-700 text-slate-500"}`}>
                  {s.ok ? "✓" : "—"} {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6" />
      <TickerTabs
        ticker={audit.ticker}
        discussion={
          <Section title={`$${audit.ticker} discussion`} badge="community board — AI-labeled, you filter">
            <MessageBoard ticker={audit.ticker} />
          </Section>
        }
        overview={
        <>
      {!anySourceOk && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          No public sources recognized ${audit.ticker} — it may be delisted, foreign-listed, or misspelled.
        </div>
      )}

      {/* Stock chart + market data */}
      {typeof audit.market.price === "number" && (
        <Section title="Stock price" badge="live · Yahoo Finance · 3-month">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-3xl font-bold text-white">
                {audit.market.currency === "USD" || !audit.market.currency ? "$" : ""}{audit.market.price.toFixed(2)}
                {audit.market.currency && audit.market.currency !== "USD" ? ` ${audit.market.currency}` : ""}
              </p>
              {typeof audit.market.changePct3mo === "number" && (
                <p className={`text-sm font-medium ${audit.market.changePct3mo >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {audit.market.changePct3mo >= 0 ? "▲" : "▼"} {Math.abs(audit.market.changePct3mo).toFixed(1)}% over 3 months
                </p>
              )}
            </div>
            <div className="flex gap-6 text-sm">
              {typeof audit.market.high52 === "number" && <div><p className="text-xs text-slate-500">52-wk high</p><p className="font-medium text-slate-200">{audit.market.high52.toFixed(2)}</p></div>}
              {typeof audit.market.low52 === "number" && <div><p className="text-xs text-slate-500">52-wk low</p><p className="font-medium text-slate-200">{audit.market.low52.toFixed(2)}</p></div>}
              {typeof audit.market.lastVolume === "number" && <div><p className="text-xs text-slate-500">Volume</p><p className="font-medium text-slate-200">{(audit.market.lastVolume / 1e6).toFixed(2)}M</p></div>}
            </div>
          </div>
          {audit.market.priceSeries && audit.market.priceSeries.length > 2 && (
            <PriceChart series={audit.market.priceSeries} up={(audit.market.changePct3mo ?? 0) >= 0} />
          )}
        </Section>
      )}

      {/* AI overview */}
      <Section title="Overview" badge={explainer.engine === "claude" ? "AI-written from observed facts" : "generated from observed facts"}>
        <p className="text-sm leading-relaxed text-slate-300">{explainer.text}</p>
      </Section>

      {/* Company profile */}
      {(audit.profile || audit.fundamentals) && (
        <Section title="Company profile" badge="SEC EDGAR registrant data + XBRL financials">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            {audit.profile?.industry && <Fact label="Industry" value={audit.profile.industry} />}
            {audit.profile?.hq && <Fact label="Headquarters" value={audit.profile.hq} />}
            {audit.profile?.incorporated && <Fact label="Incorporated in" value={audit.profile.incorporated} />}
            {audit.profile?.exchange && <Fact label="Exchange" value={audit.profile.exchange} />}
            {audit.otc?.tier && <Fact label="OTC tier" value={`${audit.otc.tier}${audit.otc.caveatEmptor ? " 🚨 CAVEAT EMPTOR" : ""}`} />}
            {audit.otc?.website && <Fact label="Website" value={audit.otc.website} />}
            {audit.profile?.fiscalYearEnd && audit.profile.fiscalYearEnd.length === 4 && (
              <Fact label="Fiscal year end" value={`${audit.profile.fiscalYearEnd.slice(0, 2)}/${audit.profile.fiscalYearEnd.slice(2)}`} />
            )}
            {audit.profile?.phone && <Fact label="IR phone" value={audit.profile.phone} />}
            {audit.profile?.founded && <Fact label="Founded" value={audit.profile.founded} />}
            {audit.profile?.employees && <Fact label="Employees" value={Number(audit.profile.employees).toLocaleString()} />}
            {audit.profile?.website && <Fact label="Website" value={audit.profile.website.replace(/^https?:\/\//, "")} />}
            {typeof audit.fundamentals?.cash === "number" && <Fact label="Cash on hand" value={money(audit.fundamentals.cash)} />}
            {typeof audit.fundamentals?.revenueAnnual === "number" && <Fact label="Revenue (annual)" value={money(audit.fundamentals.revenueAnnual)} />}
            {typeof audit.fundamentals?.netIncomeAnnual === "number" && (
              <Fact label="Net income (annual)" value={`${audit.fundamentals.netIncomeAnnual < 0 ? "−" : ""}${money(Math.abs(audit.fundamentals.netIncomeAnnual))}`} />
            )}
            {typeof audit.fundamentals?.sharesOutstanding === "number" && (
              <Fact label="Shares outstanding" value={`${(audit.fundamentals.sharesOutstanding / 1e6).toFixed(1)}M`} />
            )}
            {typeof audit.fundamentals?.sharesChangePct1y === "number" && (
              <Fact label="Share count, 1 yr" value={`${audit.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${audit.fundamentals.sharesChangePct1y.toFixed(1)}%`} />
            )}
            {typeof audit.fundamentals?.runwayQuarters === "number" && (
              <Fact label="Est. cash runway" value={`~${audit.fundamentals.runwayQuarters.toFixed(1)} quarters`} />
            )}
          </div>
        </Section>
      )}

      {/* OTC disclosure reports (non-EDGAR filers) */}
      {audit.otc && audit.otc.recentReports.length > 0 && (
        <Section title="OTC disclosure filings" badge="filed via OTC Markets Disclosure & News Service">
          <ul className="space-y-2">
            {audit.otc.recentReports.map((r, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-slate-500">{r.date}</span>
                <span className="text-slate-300">{r.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Company-provided disclosures (non-EDGAR) */}
      {companyFilings.length > 0 && (
        <Section title="Company disclosures" badge="✓ provided directly by the company">
          <ul className="space-y-2">
            {companyFilings.map((f) => (
              <li key={f.id} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-slate-500">{f.filedAt.slice(0, 10)}</span>
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">{f.form}</span>
                {f.url ? (
                  <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-slate-300 hover:text-emerald-400 hover:underline">{f.title}</a>
                ) : (
                  <span className="truncate text-slate-300">{f.title}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Mentioned in others' filings — intel signal */}
      {audit.filingMentions.length > 0 && (
        <Section title="Mentioned in other companies' SEC filings" badge="who's name-checking you in the official record">
          <ul className="space-y-2">
            {audit.filingMentions.map((m, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-faint">{m.date}</span>
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">{m.form}</span>
                <span className="text-slate-300">{m.byCompany}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* FDA / regulatory events */}
      {audit.regulatory.length > 0 && (
        <Section title="Regulatory events" badge="from openFDA">
          <ul className="space-y-2">
            {audit.regulatory.map((r, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-faint">{r.date}</span>
                <span className="shrink-0 rounded bg-orange-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-300">{r.type}</span>
                <span className="text-slate-300">{r.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Filing timeline */}
      {audit.recentFilings.length > 0 && (
        <Section title="Recent SEC filings" badge="the official record">
          <ul className="space-y-2">
            {audit.recentFilings.map((f, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-slate-500">{f.date}</span>
                <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-slate-300">{f.form}</span>
                <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-slate-300 hover:text-emerald-400 hover:underline">
                  {f.title}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* The conversation — claim pressure */}
      {audit.social.recentMessages.length > 0 && (
        <Section
          title={`The conversation about $${audit.ticker} — happening right now`}
          badge="live from StockTwits"
        >
          {rated > 0 && (
            <div className="mb-4">
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="bg-emerald-400" style={{ width: `${(audit.social.bullish / rated) * 100}%` }} />
                <div className="bg-red-400" style={{ width: `${(audit.social.bearish / rated) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                <span className="text-emerald-400">{audit.social.bullish} bullish</span> ·{" "}
                <span className="text-red-400">{audit.social.bearish} bearish</span> · {audit.social.unrated} unrated, from the latest messages
              </p>
            </div>
          )}
          <div className="space-y-2.5">
            {audit.social.recentMessages.map((m, i) => (
              <div key={i} className={`rounded-lg border p-3 ${m.sentiment === "Bearish" ? "border-red-500/20 bg-red-500/5" : m.sentiment === "Bullish" ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-800 bg-slate-950/60"}`}>
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium text-slate-300">@{m.author}</span>
                  <span className="text-slate-600">{m.followers.toLocaleString()} followers</span>
                  {m.sentiment && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${m.sentiment === "Bullish" ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                      {m.sentiment.toUpperCase()}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-slate-300">{m.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
            {questionCount > 0
              ? `${questionCount} of these messages ${questionCount === 1 ? "is a question" : "are questions"}. Replies from the company: 0.`
              : "Replies from the company in this conversation: 0."}{" "}
            Investors are writing ${audit.ticker}&apos;s story without it.
          </p>
        </Section>
      )}

      {/* Key numbers */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="StockTwits watchers" value={audit.social.watchers?.toLocaleString() ?? "—"} />
        <Metric label="Messages / day" value={audit.social.msgsPerDay !== undefined ? audit.social.msgsPerDay.toFixed(1) : "—"} />
        <Metric label="Bullish sentiment" value={bullPct !== null ? `${bullPct}%` : "—"} />
        <Metric label="News articles (30d)" value={audit.sources.find((s) => s.name === "News (GDELT)")?.ok ? audit.news.articles30d : "—"} />
        <Metric label="SEC filings (12 mo)" value={audit.filings.last12mo} sub={audit.filings.lastForm ? `latest: ${audit.filings.lastForm}` : undefined} />
        <Metric label="Share price" value={typeof audit.market.price === "number" ? `$${audit.market.price.toFixed(2)}` : "—"} sub={typeof audit.market.changePct3mo === "number" ? `${audit.market.changePct3mo >= 0 ? "+" : ""}${audit.market.changePct3mo.toFixed(1)}% / 3 mo` : undefined} />
        <Metric
          label="Volume vs 3-mo avg"
          value={
            typeof audit.market.lastVolume === "number" && typeof audit.market.avgVolume3mo === "number" && audit.market.avgVolume3mo > 0
              ? `${Math.round((audit.market.lastVolume / audit.market.avgVolume3mo) * 100)}%`
              : "—"
          }
        />
        <Metric label="Reddit posts (1 yr)" value={audit.sources.find((s) => s.name === "Reddit")?.ok ? audit.reddit.postsFound : "—"} />
        <Metric label="Short volume (FINRA)" value={audit.shortData ? `${audit.shortData.shortPct.toFixed(0)}%` : "—"} sub={audit.shortData ? `of daily volume · ${audit.shortData.venue} · incl. market-making` : undefined} />
        <Metric label="Cash on hand" value={typeof audit.fundamentals?.cash === "number" ? money(audit.fundamentals.cash) : "—"} sub={audit.fundamentals?.cashAsOf ? `as of ${audit.fundamentals.cashAsOf} (XBRL)` : undefined} />
        <Metric
          label="Cash runway"
          value={typeof audit.fundamentals?.runwayQuarters === "number" ? `~${audit.fundamentals.runwayQuarters.toFixed(1)} qtrs` : typeof audit.fundamentals?.netIncomeAnnual === "number" && audit.fundamentals.netIncomeAnnual >= 0 ? "profitable" : "—"}
          sub="at latest annual loss rate"
        />
        <Metric
          label="Share count (1 yr)"
          value={typeof audit.fundamentals?.sharesChangePct1y === "number" ? `${audit.fundamentals.sharesChangePct1y >= 0 ? "+" : ""}${audit.fundamentals.sharesChangePct1y.toFixed(0)}%` : "—"}
          sub={typeof audit.fundamentals?.sharesOutstanding === "number" ? `${(audit.fundamentals.sharesOutstanding / 1e6).toFixed(1)}M shares out` : undefined}
        />
        <Metric
          label="Insider activity (180d)"
          value={audit.insiders ? `${audit.insiders.buys}B / ${audit.insiders.sells}S` : "—"}
          sub={audit.insiders ? `${audit.insiders.form4Count180d} Form 4s · open-market buys/sells` : undefined}
        />
        <Metric
          label="Wikipedia views (30d)"
          value={audit.wiki ? audit.wiki.views30d.toLocaleString() : "—"}
          sub={audit.wiki?.title}
        />
      </div>

      {/* Catalysts */}
      {(audit.catalysts?.trials || audit.catalysts?.contracts) && (
        <Section title="Catalyst pipeline">
          {audit.catalysts.trials && (
            <div className="mb-3">
              <p className="text-sm text-slate-300">
                {audit.catalysts.trials.total} registered clinical trial{audit.catalysts.trials.total > 1 ? "s" : ""} (ClinicalTrials.gov)
              </p>
              <ul className="mt-2 space-y-1">
                {audit.catalysts.trials.samples.map((t, i) => (
                  <li key={i} className="text-xs text-slate-400">
                    {t.phase} · {t.status} — {t.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {audit.catalysts.contracts && (
            <div>
              <p className="text-sm text-slate-300">{money(audit.catalysts.contracts.totalAmount)} in federal contract awards since 2023 (USAspending.gov)</p>
              <ul className="mt-2 space-y-1">
                {audit.catalysts.contracts.samples.map((c, i) => (
                  <li key={i} className="text-xs text-slate-400">
                    {money(c.amount)} — {c.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}

      {/* Halts warning */}
      {audit.halts && audit.halts.count > 0 && (
        <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5">
          <h2 className="font-semibold text-red-300">⚠ Recent trade halts</h2>
          <ul className="mt-2 space-y-1">
            {audit.halts.recent.map((h, i) => (
              <li key={i} className="text-sm text-red-200">
                {h.date} — reason code {h.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Findings */}
      {audit.findings.length > 0 && (
        <Section title="What the live scan found">
          <ul className="space-y-2">
            {audit.findings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-emerald-400">▸</span>
                {f}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* News */}
      {audit.news.samples.length > 0 && (
        <Section title="Recent news">
          <ul className="space-y-2">
            {audit.news.samples.map((n, i) => (
              <li key={i} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 text-xs text-slate-500">{n.date}</span>
                <span className="text-slate-300">{n.title}</span>
                <span className="shrink-0 text-xs text-slate-500">{n.outlet}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Most-followed voices */}
      {audit.social.topAccounts.length > 0 && (
        <Section title={`Most-followed accounts discussing $${audit.ticker}`}>
          <ul className="space-y-2">
            {audit.social.topAccounts.slice(0, 5).map((a) => (
              <li key={a.username} className="flex items-baseline gap-3 text-sm">
                <span className="shrink-0 font-medium text-white">@{a.username}</span>
                <span className="shrink-0 text-xs text-slate-500">{a.followers.toLocaleString()} followers</span>
                <span className="truncate text-xs text-slate-400">{a.lastMessage}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Q&A — companies and investors convene here */}
      <Section
        title="Questions & answers"
        badge={claimed ? "✓ company answers are verified, officer-approved, and disclosed on X simultaneously" : "company has not claimed this page yet"}
      >
        <div className="space-y-3">
          {tickerQuestions.map((q) => (
            <div key={q.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs text-slate-500">
                {q.author} asked {new Date(q.ts).toLocaleDateString()}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-200">{q.question}</p>
              {q.status === "answered" && q.answerText ? (
                <div className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                  <p className="text-xs font-semibold text-emerald-400">
                    ✓ VERIFIED COMPANY ANSWER
                    {q.xPostUrl && (
                      <a href={q.xPostUrl} target="_blank" rel="noreferrer" className="ml-2 font-normal text-emerald-300 hover:underline">
                        also disclosed on X ↗
                      </a>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-300">{q.answerText}</p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-amber-400/80">
                  {claimed ? "Awaiting company answer — it's in their queue." : "Unanswered — this company hasn't claimed its page."}
                </p>
              )}
            </div>
          ))}
          <AskCompany ticker={ticker} claimed={claimed} />
        </div>
      </Section>

      {/* Claim — the business hook */}
      <div id="claim">
        <ClaimCard ticker={audit.ticker} />
      </div>
        </>
        }
      />

      {/* Disclosure */}
      <p className="mt-8 text-xs leading-relaxed text-slate-600">
        Not investment advice. This report aggregates publicly available data (SEC EDGAR, StockTwits, Reddit, Yahoo Finance,
        GDELT) at generation time and may be incomplete or delayed. Verify all figures against official SEC filings at sec.gov
        before making any decision. PubcoZone is a compensated service provider to companies that claim their pages; claimed
        pages are labeled.
      </p>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/t" className="text-sm text-slate-400 hover:text-slate-200">
          ← All ticker reports
        </Link>
        <span className="text-xs text-slate-600">PubcoZone · live public-data intelligence</span>
      </div>
      {children}
    </div>
  );
}

function Section({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="font-semibold text-white">{title}</h2>
        {badge && <span className="text-[11px] text-slate-500">{badge}</span>}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-200">{value}</p>
    </div>
  );
}

function PriceChart({ series, up }: { series: number[]; up: boolean }) {
  const W = 720, H = 160, pad = 6;
  const min = Math.min(...series), max = Math.max(...series), range = max - min || 1;
  const pts = series.map((v, i) => ({
    x: pad + (i / (series.length - 1)) * (W - pad * 2),
    y: H - pad - ((v - min) / range) * (H - pad * 2),
  }));
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x.toFixed(1)},${H - pad} L${pts[0].x.toFixed(1)},${H - pad} Z`;
  const color = up ? "#34d399" : "#f87171";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full">
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

function money(n: number): string {
  return Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

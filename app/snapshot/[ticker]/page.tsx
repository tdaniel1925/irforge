import type { Metadata } from "next";
import Link from "next/link";
import { buildSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://pubcozone.com";

const GRADE_COLOR: Record<string, string> = {
  A: "text-emerald-500", B: "text-emerald-500", C: "text-amber-500", D: "text-orange-500", F: "text-red-500",
};

export async function generateMetadata({ params }: { params: { ticker: string } }): Promise<Metadata> {
  const ticker = params.ticker.toUpperCase();
  const title = `How investors see $${ticker} — Visibility Snapshot | PubcoZone`;
  const description = `A free, public-data visibility snapshot for $${ticker}: investor attention, media coverage, conversation, disclosure flow, and where the gaps are.`;
  const url = `${SITE}/snapshot/${ticker}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "PubcoZone", type: "article", images: [{ url: `${SITE}/api/og/${ticker}` }] },
    twitter: { card: "summary_large_image", title, description, images: [`${SITE}/api/og/${ticker}`] },
  };
}

function Bar({ score }: { score: number | null }) {
  const v = score ?? 0;
  const color = v >= 70 ? "bg-emerald-500" : v >= 55 ? "bg-amber-500" : v >= 40 ? "bg-orange-500" : "bg-red-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-app-hover">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export default async function SnapshotPage({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase();
  const snap = await buildSnapshot(ticker);

  if (!snap) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold text-app">Couldn&apos;t build a snapshot for ${ticker}</h1>
        <p className="mt-3 text-muted">We couldn&apos;t reach enough public data for this ticker right now. Double-check the symbol, or try again in a minute.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white">← PubcoZone</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-app">← PubcoZone</Link>
        <span className="text-xs text-faint">Built from public data · {new Date(snap.generatedAt).toLocaleDateString()}</span>
      </div>

      {/* Hero: the grade */}
      <div className="rounded-2xl border border-app bg-surface p-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Visibility Snapshot</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-app">{snap.companyName} <span className="text-muted">(${snap.ticker})</span></h1>
        <div className="mt-5 flex items-end gap-6">
          <div>
            <p className={`text-6xl font-black leading-none ${GRADE_COLOR[snap.grade]}`}>{snap.grade}</p>
            <p className="mt-1 text-sm text-muted">Visibility grade</p>
          </div>
          <div className="flex-1">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-app">{snap.score}<span className="text-base font-normal text-muted">/100</span></span>
            </div>
            <Bar score={snap.score} />
            <p className="mt-2 text-sm text-muted">How visible {snap.companyName} is to investors across the public channels that shape perception.</p>
          </div>
        </div>
      </div>

      {/* Gaps — the hook */}
      {snap.gaps.length > 0 && (
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-6">
          <h2 className="font-semibold text-app">⚠ Where ${snap.ticker} is losing investor attention</h2>
          <ul className="mt-3 space-y-3">
            {snap.gaps.map((g) => (
              <li key={g.label}>
                <p className="text-sm font-medium text-app">{g.label}</p>
                <p className="text-sm text-muted">{g.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full pillar breakdown */}
      <div className="mt-6 rounded-2xl border border-app bg-surface p-6">
        <h2 className="mb-4 font-semibold text-app">The full picture</h2>
        <div className="space-y-4">
          {snap.pillars.map((p) => (
            <div key={p.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium text-app">{p.label}</span>
                <span className="text-muted">{p.score ?? "—"}</span>
              </div>
              <Bar score={p.score} />
              <p className="mt-1 text-xs text-muted">{p.detail}</p>
            </div>
          ))}
        </div>
        {snap.sources.length > 0 && (
          <p className="mt-5 text-[11px] text-faint">Sources: {snap.sources.map((s) => s.name).join(", ")}. Public data only — not investment advice.</p>
        )}
      </div>

      {/* CTA */}
      <div className="mt-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.06] p-7 text-center">
        <h2 className="text-xl font-bold text-app">This is your company&apos;s story — are you telling it?</h2>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          PubcoZone turns your SEC filings into compliant updates you approve, answers investors on the record, and helps you
          reach the funds that hold your peers — so ${snap.ticker} stops leaving attention on the table. You control everything; nothing posts without your approval.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/login?ticker=${snap.ticker}`} className="rounded-lg bg-emerald-600 px-6 py-3 font-semibold text-white hover:bg-emerald-700">
            Claim ${snap.ticker} &amp; get the full report →
          </Link>
          <Link href="/sample-brief" className="rounded-lg border border-app px-6 py-3 font-medium text-app hover:bg-app-hover">See what you get</Link>
        </div>
        <p className="mt-3 text-xs text-faint">Free to claim. No card required.</p>
      </div>
    </div>
  );
}

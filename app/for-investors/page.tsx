import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav, MarketingFooter } from "@/components/marketing/Chrome";

export const metadata: Metadata = {
  title: "For Investors — research stocks without the noise | PubcoZone",
  description:
    "A stock board where you control what you see. AI checks claims against SEC filings, flags coordinated promotion, explains filings in plain English, and x-rays your watchlist — facts over hype. Free to research any ticker.",
  alternates: { canonical: "https://pubcozone.com/for-investors" },
  openGraph: {
    title: "For Investors — research stocks without the noise | PubcoZone",
    description: "AI that checks claims against filings, flags pumps, and x-rays your watchlist. Facts over hype.",
    url: "https://pubcozone.com/for-investors",
    siteName: "PubcoZone",
    type: "website",
  },
};

const FEATURES = [
  {
    icon: "🔎",
    title: "Truth-check the board",
    body: "When a post makes a factual claim — \"no cash, going bankrupt\" — AI checks it against the company's latest SEC filings and labels it supported, contradicted, or unverifiable, with the source linked. Claims get receipts, not just upvotes.",
  },
  {
    icon: "🚨",
    title: "Manipulation radar",
    body: "Spot coordinated promotion before you're the exit liquidity. AI flags sudden synchronized hype, new-account swarms, and unusual volume on a ticker — a plain caution, so you know when the hype isn't organic.",
  },
  {
    icon: "📰",
    title: "Filings, in plain English",
    body: "Get an alert the moment a company you follow files — and AI tells you what that filing type actually means and what to look for, with a link to read it yourself on EDGAR. A research analyst in your pocket, not a raw feed.",
  },
  {
    icon: "🩻",
    title: "Portfolio X-ray",
    body: "Point it at your watchlist and see the facts buried in the filings — dilution, cash runway, insider buying or selling, short-volume — across everything you follow, in one view. The boring, scary truths most people never read.",
  },
  {
    icon: "🧭",
    title: "You control what you see",
    body: "Filter out the trash and the noise. Every post is AI-labeled factual / opinion / hype / FUD — mute the hype, hide the FUD, show only signal. Your feed, your rules.",
  },
  {
    icon: "🎙️",
    title: "Answers from the actual company",
    body: "Ask a question and get a verified, filing-cited answer from the company itself — on the record, where you can check it — not a guess from an anonymous account.",
  },
];

export default function ForInvestorsPage() {
  return (
    <div className="min-h-screen bg-app text-app">
      <MarketingNav audience="investors" />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-app">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> For investors
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-app sm:text-5xl">
            Research stocks where <span className="text-emerald-600 dark:text-emerald-400">the truth wins</span> — not whoever&apos;s loudest.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Other boards are anonymous pumpers and bashers writing the story. PubcoZone checks claims against the
            filings, flags coordinated promotion, and lets you filter out the noise — so you&apos;re not the mark.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Join free →
            </Link>
            <Link href="/t" className="rounded-xl border border-app px-6 py-3 text-sm font-semibold text-app transition hover:bg-app-hover">
              Look up any stock
            </Link>
          </div>
          <p className="mt-3 text-xs text-faint">Researching any ticker is always free — no signup.</p>
        </div>
      </section>

      {/* The differentiators — the hero of the investor experience */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">AI that has the little guy&apos;s back.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
          The tools other platforms will never build — because they profit from the noise. Everything here is facts and
          research, never a recommendation.
        </p>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-app bg-surface p-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">{f.icon}</div>
              <h3 className="text-lg font-semibold text-app">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* vs the boards */}
      <section className="border-y border-app bg-surface-2/40">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-app">The board, rebuilt for you.</h2>
          <div className="mt-10 overflow-hidden rounded-2xl border border-app bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-app bg-surface-2/60">
                <tr>
                  <th className="px-4 py-3 font-semibold text-app">What you get</th>
                  <th className="px-4 py-3 font-semibold text-faint">Anonymous boards</th>
                  <th className="px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">PubcoZone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app/60">
                {[
                  ["Claims checked against filings", "No", "Yes — labeled & cited"],
                  ["Coordinated-promotion warnings", "No", "Yes — manipulation radar"],
                  ["The company answers, on the record", "No", "Yes — verified & cited"],
                  ["Filter the hype / FUD out of your feed", "No", "Yes — you control it"],
                  ["Portfolio-wide filing risk view", "No", "Yes — portfolio x-ray"],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td className="px-4 py-3 text-app">{r[0]}</td>
                    <td className="px-4 py-3 text-faint">{r[1]}</td>
                    <td className="px-4 py-3 font-medium text-emerald-600 dark:text-emerald-400">{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-faint">
            PubcoZone is not an investment adviser. Everything here is information and research drawn from public
            sources — not investment advice, and not a recommendation to buy or sell any security. Always verify against
            the company&apos;s SEC filings and do your own research.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-app sm:text-4xl">Stop being the exit liquidity.</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted">Research any company free, or join to follow your watchlist, get alerts, and x-ray your holdings.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Join free →
          </Link>
          <Link href="/t" className="rounded-xl border border-app px-6 py-3 text-sm font-semibold text-app transition hover:bg-app-hover">
            Look up a stock
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

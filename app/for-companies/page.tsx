import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav, MarketingFooter } from "@/components/marketing/Chrome";

export const metadata: Metadata = {
  title: "For Public Companies — your entire IR program in one platform | PubcoZone",
  description:
    "AI investor relations for small public companies. Turn filings into compliant updates you approve, answer shareholders on the record, run a real IR CRM, and defend your name — all for less than one junior hire.",
  alternates: { canonical: "https://pubcozone.com/for-companies" },
  openGraph: {
    title: "For Public Companies — your entire IR program in one platform | PubcoZone",
    description: "AI IR for small public companies: compliant posting you approve, a real CRM, and defense — for less than an agency.",
    url: "https://pubcozone.com/for-companies",
    siteName: "PubcoZone",
    type: "website",
  },
};

const PILLARS = [
  { icon: "🧩", title: "Content pipeline", body: "Turn any filing into a post your execs sound like — AI drafts it, the Reg FD check flags it for your review, you approve in a tap. Idea to published in minutes." },
  { icon: "⚖️", title: "Compliance tools, your control", body: "Every draft gets a first-pass green/yellow/red flag; risky ones route to your counsel for a signed, tamper-evident sign-off. You decide what's safe — nothing posts without your approval." },
  { icon: "🛡️", title: "Defend your name", body: "Threats and FUD get flagged within minutes — with a calm, filing-cited rebuttal ready to approve. On other boards you're gagged. Here you have a voice." },
  { icon: "👥", title: "A real IR CRM", body: "Contacts, firms, deals, tasks, and a full pipeline built for IR. Find funds that hold your peers, import your list, and let AI triage every inbound." },
  { icon: "📣", title: "Get the word out", body: "A free Marketing Kit (AI posts, branded graphics, share links), embeddable live badges for your site, and a public page investors actually trust." },
  { icon: "📊", title: "Prove it's working", body: "One Visibility Score, a live intelligence dashboard, and a one-click weekly summary for your board. Every action logged for your compliance record." },
];

const STEPS = [
  { n: 1, t: "Connect your ticker", b: "We pull your SEC filings and live public data automatically — your profile and first drafts are ready in minutes." },
  { n: 2, t: "AI drafts, the Reg FD check flags", b: "AI writes posts in your execs' voice and flags anything material — green posts you approve, red ones route to counsel." },
  { n: 3, t: "You approve in a tap", b: "Read it, approve it, and it publishes to X, LinkedIn and more with your disclosures attached. Nothing goes out without you." },
  { n: 4, t: "Watch your score climb", b: "Track your Visibility Score, see the live dashboard, and hand a one-click weekly summary to your board." },
];

const TIERS = [
  { name: "Free", price: "$0", popular: false, features: ["A verified public page with live data", "Free AI Research Panel on your page", "Free Marketing Kit + share links", "Investors can find & follow you"] },
  { name: "Board", price: "$399", popular: false, features: ["Investor Q&A inbox — every open question in one place", "AI-drafted, compliance-checked verified answers", "Instant email alerts when investors ask", "Recurring question themes + board sentiment"] },
  { name: "Starter", price: "$1,500", popular: false, features: ["Everything in Board", "Filing-to-post AI drafting", "Reg FD green/yellow/red screening", "Multi-channel publishing (X, LinkedIn)", "Document vault + embeddable live badges"] },
  { name: "Growth", price: "$3,500", popular: true, features: ["Everything in Starter", "Full IR CRM — contacts, deals, tasks", "Counsel Console + signed approvals", "Threat Radar + AI rebuttals", "13F targeting"] },
  { name: "Command", price: "$6,000", popular: false, features: ["Everything in Growth", "Quiet-period mode + custom voices", "Intelligence dashboard + board summaries", "Short-attack defense playbook", "Dedicated onboarding"] },
];

export default function ForCompaniesPage() {
  return (
    <div className="min-h-screen bg-app text-app">
      <MarketingNav audience="companies" />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-app">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="mx-auto max-w-4xl px-6 py-20 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> For public companies
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-app sm:text-5xl">
            Your investors are talking about you.{" "}
            <span className="text-emerald-600 dark:text-emerald-400">Now you can talk back — on the record.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            PubcoZone is your entire IR program in one platform: AI turns your filings into ready-to-post updates, a Reg FD
            check and counsel sign-off keep the decision in your hands, a built-in CRM tracks every investor, and you
            answer the board on the record — all approved by you with one tap.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/app" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Open the app →
            </Link>
            <a href="#pricing" className="rounded-xl border border-app px-6 py-3 text-sm font-semibold text-app transition hover:bg-app-hover">
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">Your whole IR program. One platform.</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Everything an in-house IR team and a $10k/mo agency does — in one place, for less.</p>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PILLARS.map((it) => (
            <div key={it.title} className="rounded-2xl border border-app bg-surface p-6">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">{it.icon}</div>
              <h3 className="text-lg font-semibold text-app">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-app bg-surface-2/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-app">From filing to posted in minutes — not days.</h2>
          <div className="mt-12 grid gap-8 md:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.n}>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white">{s.n}</div>
                <h3 className="text-lg font-semibold text-app">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-faint">
            PubcoZone gives you the tools and the control — you and your counsel decide what&apos;s compliant. We publish
            what you approve, publicly and on the record.{" "}
            <Link href="/how-its-legal" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">Read why it&apos;s legal →</Link>
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">Simple pricing. Less than one junior hire.</h2>
        <p className="mt-3 text-center text-muted">A local IR agency charges $10,000+ a month to do less. Start owning your board for $399/mo.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {TIERS.map((t) => (
            <div key={t.name} className={`relative rounded-2xl border p-6 ${t.popular ? "border-emerald-500 bg-surface shadow-lg" : "border-app bg-surface"}`}>
              {t.popular && <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">MOST POPULAR</span>}
              <h3 className="text-lg font-semibold text-app">{t.name}</h3>
              <p className="mt-2 text-3xl font-bold text-app">{t.price}{t.price !== "$0" && <span className="text-base font-normal text-faint">/mo</span>}</p>
              <ul className="mt-5 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link href="/app" className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Get started →
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

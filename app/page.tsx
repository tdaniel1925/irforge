"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MarketingNav, MarketingFooter } from "@/components/marketing/Chrome";
import SplitHero from "@/components/marketing/SplitHero";

export default function Landing() {
  return (
    <div className="bg-app text-app">
      <MarketingNav audience="hub" />
      <SplitHero />
      <Hero />
      <LevelField />
      <ForInvestors />
      <LogoStrip />
      <Pillars />
      <HowItWorks />
      <Compliance />
      <Comparison />
      <PlatformComparison />
      <BothSides />
      <WhyClaim />
      <Stats />
      <Pricing />
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}

/* --------------------------------- Hero ---------------------------------- */
function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-app">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-2">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Where investors and public companies meet — on the record
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-app sm:text-5xl">
            Look up any stock.{" "}
            <span className="text-emerald-600 dark:text-emerald-400">Get the real story, not the hype.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Every ticker gets a free page built from the actual SEC record — price, cash, insiders, short interest, filings —
            plus a board where <span className="font-semibold text-app">hype and FUD get AI-flagged</span> and the company answers
            on the record. Research any company free. No signup, no pump-and-dump, no exit liquidity.
          </p>
          <TickerLookup />
          <p className="mt-3 text-xs text-faint">Free · no signup · public data only</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/login?type=investor&mode=signup" className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
              Create a free investor account →
            </Link>
            <Link href="/for-companies" className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Are you the company? Claim your page →
            </Link>
          </div>
        </div>
        <div>
          <HeroMock />
        </div>
      </div>
    </section>
  );
}

function TickerLookup() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <div className="flex flex-1 overflow-hidden rounded-xl border border-app bg-surface focus-within:border-emerald-500">
        <span className="flex items-center pl-4 text-faint">$</span>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && ticker && router.push(`/t/${ticker}`)}
          placeholder="Look up any ticker — e.g. LAC"
          className="w-full bg-transparent px-2 py-3 text-app uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal focus:outline-none"
        />
      </div>
      <button
        onClick={() => ticker && router.push(`/t/${ticker}`)}
        className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        Research it free →
      </button>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-app bg-surface p-5 shadow-xl shadow-black/5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">$EXMPL · Discussion board</p>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">AI-LABELED</span>
        </div>
        <div className="space-y-2">
          {/* A hyped post, flagged */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-app">@moon_rocket</span>
              <span className="whitespace-nowrap rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">HYPE</span>
            </div>
            <p className="mt-1 text-pretty text-sm text-app">This is going to $10 easy, load up before it rips!! 🚀🚀</p>
          </div>
          {/* An investor question */}
          <div className="rounded-lg border border-app bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-app">@sarah_invests</span>
              <span className="whitespace-nowrap rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 dark:text-sky-400">QUESTION</span>
            </div>
            <p className="mt-1 text-pretty text-sm text-app">What&apos;s your actual cash runway after this quarter?</p>
          </div>
          {/* The verified company answer */}
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-app">EXMPL, Inc. (IR)</span>
              <span className="whitespace-nowrap rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">✓ VERIFIED</span>
            </div>
            <p className="mt-1 text-pretty text-sm text-app">$11.2M cash, zero debt — runway past our next two milestones. Full detail in the 10-Q.</p>
          </div>
        </div>
        <p className="mt-3 text-pretty text-center text-[11px] text-faint">Hype gets flagged. Questions get answered on the record. You see the difference.</p>
      </div>
    </div>
  );
}

/* ---------------------- Level-the-playing-field band --------------------- */
function LevelField() {
  return (
    <section className="border-b border-app bg-surface-2/40">
      <div className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">
          The boards were rigged against you. We&apos;re evening the score.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
          On InvestorsHub and StockTwits, anonymous accounts pump, dash, and bash with zero accountability —
          and the one party who actually knows the truth, the company, isn&apos;t allowed to respond. That asymmetry
          is how good companies get buried and retail investors get burned. PubcoZone flips it.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Contrast bad="Anonymous pumpers ramp the stock, then dump on retail." good="Hype gets AI-flagged in public, and the company can post the facts." />
          <Contrast bad="Short-side bashers spread FUD; the company is gagged." good="A verified, filing-cited response goes out — to everyone at once, legally." />
          <Contrast bad="Investors can&apos;t tell signal from noise." good="Every post is labeled by signal quality, so the truth has the advantage." />
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-faint">
          We&apos;ll say it plainly: this protects honest companies <em>and</em> the investors those manipulators prey on.
          A fair conversation is better for everyone except the people gaming it.
        </p>
      </div>
    </section>
  );
}

function Contrast({ bad, good }: { bad: string; good: string }) {
  return (
    <div className="rounded-2xl border border-app bg-surface p-5">
      <div className="flex gap-2 text-sm">
        <span className="text-red-500">✕</span>
        <p className="text-muted line-through decoration-red-500/40">{bad}</p>
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        <span className="text-emerald-500">✓</span>
        <p className="font-medium text-app">{good}</p>
      </div>
    </div>
  );
}

/* --------------------------- For investors ------------------------------- */
function ForInvestors() {
  const points = [
    { title: "You control what you see", body: "Filter out the trash and the noise. Mute the hype, hide the unverified, and show only what's labeled factual — your feed, your rules. The board works for you, not for whoever's loudest." },
    { title: "No pump-and-dump land", body: "Hype and coordinated ramping get AI-flagged before they spread. You see what's labeled \"factual\" vs. \"hype\" vs. \"unverified\" — so you're not the exit liquidity for someone else's scheme." },
    { title: "Answers from the actual company", body: "Ask a question and get a verified, filing-cited answer from the company itself — not a guess from an anonymous account. The truth, on the record, where you can check it." },
    { title: "Everything in one place", body: "Price, SEC filings, cash & runway, insider buying, short interest, and news — the research that takes an hour across six tabs, on one page." },
    { title: "A free AI Research Panel", body: "Four built-in lenses on every company — Value 💵, Growth 🚀, Skeptic 🧐, and Explainer 📖 — drawn straight from the filings. Independent, free, and impossible to buy. Sponsored briefs are always labeled as such." },
    { title: "Manipulation has nowhere to hide", body: "Bashers can't run unchecked and pumpers can't astroturf. Every post is labeled, the company can respond, and bad-faith claims get called out in public." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-sky-500" /> For investors
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-app">Finally — a board where you control what you see.</h2>
      <p className="mt-3 max-w-2xl text-muted">
        PubcoZone isn&apos;t another message board where anonymous accounts pump, dump, and bash. You filter out the trash
        and the noise, the company answers on the record, and you can actually trust what you&apos;re reading.
      </p>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl border border-app bg-surface p-6">
            <h3 className="text-lg font-semibold text-app">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-faint">
        Researching a company is always free — no signup. <span className="text-muted">Look up any ticker above to see its page.</span>
      </p>
    </section>
  );
}

/* ------------------------------- Logo strip ------------------------------ */
function LogoStrip() {
  return (
    <section className="border-b border-app bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-6 py-8 text-center">
        <p className="text-sm text-faint">
          Built for companies on <span className="font-medium text-muted">NASDAQ</span> · <span className="font-medium text-muted">NYSE American</span> · <span className="font-medium text-muted">TSX Venture</span> · <span className="font-medium text-muted">OTC Markets</span>
        </p>
      </div>
    </section>
  );
}

/* -------------------------------- Pillars -------------------------------- */
function Pillars() {
  const items = [
    { icon: "🧩", title: "Content pipeline", body: "Turn any filing into a post your execs sound like — AI drafts it, the Reg FD check screens it, you approve in a tap. Idea to published in minutes." },
    { icon: "⚖️", title: "Compliance tools, your control", body: "Every draft gets a first-pass green/yellow/red flag for your review — risky ones route to your counsel for a signed, tamper-evident sign-off. You decide what's safe; nothing posts without your approval. Quiet-period mode lets you suspend publishing in one tap." },
    { icon: "🛡️", title: "Defend your name", body: "Threats and FUD get flagged within minutes — with a calm, filing-cited rebuttal ready to approve. On other boards you're gagged. Here you have a voice." },
    { icon: "👥", title: "A real CRM", body: "Contacts, firms, deals, tasks, and a full pipeline — built for IR. Find funds that hold your peers, import your list, and let AI triage every inbound." },
    { icon: "📣", title: "Get the word out", body: "A free Marketing Kit (AI posts, branded graphics, share links), embeddable live badges for your site, and a public page investors actually trust." },
    { icon: "📊", title: "Prove it's working", body: "One Visibility Score, a live intelligence dashboard, and a one-click weekly summary for your board. Every action logged for your compliance record." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight text-app">Your whole IR program. One platform.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted">From drafting investor updates to managing investors to defending your name — everything an in-house IR team and a $10k/mo agency does, in one place, for less.</p>
      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="rounded-2xl border border-app bg-surface p-6">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">{it.icon}</div>
            <h3 className="text-lg font-semibold text-app">{it.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ How it works ----------------------------- */
function HowItWorks() {
  const steps = [
    { n: 1, t: "Connect your ticker", b: "We pull your SEC filings and live public data automatically — your profile and first drafts are ready in minutes." },
    { n: 2, t: "AI drafts, the Reg FD check screens", b: "AI writes posts in your execs' voice and flags anything material — green posts you approve, red ones route to counsel for sign-off." },
    { n: 3, t: "You approve in a tap", b: "Read it, approve it, and it publishes to X, LinkedIn and more with your disclosures attached. Nothing goes out without you." },
    { n: 4, t: "Watch your score climb", b: "Track your Visibility Score, see the live dashboard, and hand a one-click weekly summary to your board." },
  ];
  return (
    <section id="how" className="border-y border-app bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">From filing to posted in minutes — not days.</h2>
        <div className="mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl border border-app bg-surface">
          <Image src="/img/how.png" alt="Filing to approval to growth — a simple three-step flow" width={1024} height={576} className="w-full" />
        </div>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-base font-bold text-white">{s.n}</div>
              <h3 className="text-lg font-semibold text-app">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Compliance ------------------------------- */
function Compliance() {
  const checks = [
    "Nothing posts without a named human's approval — you hold the keys",
    "Your disclosures attach automatically — Section 17(b) + forward-looking statements",
    "AI drafts only from your public filings — you and your counsel decide what's safe",
    "A complete audit log, ready for your counsel, regulators, or your exchange",
  ];
  return (
    <section id="compliance" className="mx-auto max-w-6xl px-6 py-20">
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 sm:p-12">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-app">You stay in control. We give you the tools.</h2>
            <p className="mt-3 text-muted">
              Promoting a public company is not like marketing a restaurant. PubcoZone gives you the controls — first-pass flagging,
              counsel sign-off, automatic disclosures, and a full audit trail — and puts every decision in your hands. We don&apos;t
              decide what&apos;s compliant; you and your counsel do. What we do is publish what you approve, publicly and on the record.
            </p>
            <Link href="/how-its-legal" className="mt-4 inline-block text-sm font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              Read exactly why it&apos;s legal for your company to respond →
            </Link>
            <ul className="mt-6 space-y-3">
              {checks.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>
                  <span className="text-sm text-app">{c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-2xl border border-app bg-surface">
            <Image src="/img/compliance.png" alt="Compliance, trust, and legal safety" width={1024} height={576} className="w-full" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ Comparison ------------------------------- */
function Comparison() {
  const rows = [
    ["Speed (filing → post)", "—", "2–3 days", "Minutes"],
    ["Monthly cost", "$0", "$10,000+", "From $399"],
    ["Defends you from attacks", "No", "Rarely", "Yes — in minutes"],
    ["Answer shareholders on the record", "No", "Slowly", "Yes — public & simultaneous"],
    ["Proof for your board", "None", "Quarterly deck", "Live score + log"],
    ["Always on", "No", "Business hours", "24/7"],
  ];
  return (
    <section className="border-y border-app bg-surface-2/40">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">Why companies switch.</h2>
        <div className="mt-10 overflow-hidden rounded-2xl border border-app">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left">
                <th className="px-4 py-3 font-medium text-muted"></th>
                <th className="px-4 py-3 text-center font-medium text-muted">Doing nothing</th>
                <th className="px-4 py-3 text-center font-medium text-muted">$10k/mo agency</th>
                <th className="px-4 py-3 text-center font-semibold text-emerald-600 dark:text-emerald-400">PubcoZone</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-app bg-surface">
                  <td className="px-4 py-3 font-medium text-app">{r[0]}</td>
                  <td className="px-4 py-3 text-center text-faint">{r[1]}</td>
                  <td className="px-4 py-3 text-center text-muted">{r[2]}</td>
                  <td className="px-4 py-3 text-center font-semibold text-app">{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* -------------------- Platform comparison (vs the boards) ---------------- */
function PlatformComparison() {
  // value type: "yes" | "no" | "partial" | text
  const rows: { label: string; pz: string; st: string; ih: string }[] = [
    { label: "AI-moderated posts (hype & FUD labeled)", pz: "yes", st: "no", ih: "no" },
    { label: "The company can respond on the record", pz: "yes:Public & simultaneous", st: "no", ih: "no" },
    { label: "Real SEC filings, financials, insider & short data on every page", pz: "yes", st: "partial", ih: "no" },
    { label: "Verified company identity", pz: "yes", st: "no", ih: "no" },
    { label: "Anonymous pump-and-dump culture", pz: "no:That's the point", st: "rampant", ih: "rampant" },
    { label: "Built for compliant IR — not just chatter", pz: "yes", st: "no", ih: "no" },
    { label: "Free company page + investor tools", pz: "yes", st: "partial", ih: "partial" },
    { label: "Paywalls & ad-clutter", pz: "minimal:Minimal", st: "ads:Ads", ih: "heavy:Heavy ads + paywall" },
  ];

  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> PubcoZone vs the message boards
      </div>
      <h2 className="text-3xl font-bold tracking-tight text-app sm:text-4xl">Not another message board.</h2>
      <p className="mt-3 max-w-2xl text-muted">
        StockTwits and InvestorsHub let anonymous strangers write your story. PubcoZone is built on the public record —
        and the company gets a voice. Better for honest companies, and better for the investors those boards put at risk.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-app">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-surface text-left">
              <th className="px-4 py-4 font-medium text-muted"></th>
              <th className="px-4 py-4 text-center align-bottom">
                <span className="block text-base font-bold tracking-tight">
                  <span className="text-app">Pubco</span>
                  <span className="text-emerald-600 dark:text-emerald-400">Zone</span>
                </span>
                <span className="mt-1 block text-xs font-normal text-faint">Compliant IR</span>
              </th>
              <th className="px-4 py-4 text-center align-bottom">
                <span className="block text-base font-semibold text-muted">StockTwits</span>
                <span className="mt-1 block text-xs font-normal text-faint">Message board</span>
              </th>
              <th className="px-4 py-4 text-center align-bottom">
                <span className="block text-base font-semibold text-muted">InvestorsHub</span>
                <span className="mt-1 block text-xs font-normal text-faint">Message board</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-app bg-surface">
                <td className="px-4 py-3.5 font-medium text-app">{r.label}</td>
                <td className="bg-emerald-500/[0.06] px-4 py-3.5 text-center align-middle">
                  <PlatformCell value={r.pz} highlighted />
                </td>
                <td className="px-4 py-3.5 text-center align-middle">
                  <PlatformCell value={r.st} />
                </td>
                <td className="px-4 py-3.5 text-center align-middle">
                  <PlatformCell value={r.ih} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-sm text-faint">
        Comparison reflects each platform&apos;s positioning and widely-reported reputation. PubcoZone is the
        compliance-first alternative — for investors who want signal over noise, and companies that want a voice.
      </p>
    </section>
  );
}

function PlatformCell({ value, highlighted = false }: { value: string; highlighted?: boolean }) {
  const [kind, label] = value.includes(":") ? value.split(":") : [value, ""];

  if (kind === "yes") {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs text-white ${highlighted ? "bg-emerald-600" : "bg-emerald-500/80"}`}>✓</span>
        {label && <span className="text-xs text-muted">{label}</span>}
      </span>
    );
  }
  if (kind === "no") {
    // A red "no" — but for PubcoZone's "anonymous pump-and-dump" row, no is GOOD.
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${highlighted ? "bg-emerald-600 text-white" : "bg-surface-2 text-red-500"}`}>
          {highlighted ? "✓" : "✕"}
        </span>
        {label && <span className="text-xs text-muted">{label}</span>}
      </span>
    );
  }
  if (kind === "partial") {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs text-amber-500">~</span>
        <span className="text-xs text-faint">Partial</span>
      </span>
    );
  }
  if (kind === "rampant") {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10 text-xs text-red-500">✕</span>
        <span className="text-xs text-red-500">Rampant</span>
      </span>
    );
  }
  // Plain text values (Minimal / Ads / Heavy ads + paywall)
  return <span className={`text-xs ${highlighted ? "font-semibold text-app" : "text-muted"}`}>{label || kind}</span>;
}

/* ----------------------- Both Sides + Sponsored Brief -------------------- */
function BothSides() {
  const lenses = [
    { icon: "💵", name: "Value", blurb: "What the balance sheet and cash flows actually justify." },
    { icon: "🚀", name: "Growth Optimist", blurb: "The credible upside if the plan executes." },
    { icon: "🧐", name: "Skeptic", blurb: "The bear case, the risks, and what could break." },
    { icon: "📖", name: "Explainer", blurb: "Plain-English context, no spin, no jargon." },
  ];
  return (
    <section className="border-y border-app bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-app bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> New on every company page
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-app sm:text-4xl">
          Both sides of every stock. <span className="text-emerald-600 dark:text-emerald-400">Instantly. Cited.</span>
        </h2>
        <p className="mt-3 max-w-2xl text-muted">
          Message boards give you one-sided, anonymous pumping and bashing. PubcoZone gives you a fair, multi-angle read —
          the bull case <em>and</em> the bear case, every claim grounded in the company&apos;s real SEC filings. And the part
          that matters most: the independent panel is free, and <span className="font-semibold text-app">you can&apos;t pay for a good rating.</span>
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {/* LEFT — Free, independent Both Sides panel */}
          <div className="flex flex-col rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-bold text-white">FREE · INDEPENDENT</span>
              <span className="text-xs font-medium text-faint">On every PubcoZone company page</span>
            </div>
            <h3 className="mt-4 text-xl font-bold text-app">The &ldquo;Both Sides&rdquo; AI Research Panel</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A panel of clearly-labeled AI lenses gives investors a fair, multi-angle read on the stock — grounded in the
              real filings, every one badged <span className="font-semibold text-app">🤖 AI</span>.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-app bg-surface px-3 py-1.5 text-xs font-medium text-app">💵 Value</span>
              <span className="rounded-full border border-app bg-surface px-3 py-1.5 text-xs font-medium text-app">🚀 Growth</span>
              <span className="rounded-full border border-app bg-surface px-3 py-1.5 text-xs font-medium text-app">🧐 Skeptic</span>
              <span className="rounded-full border border-app bg-surface px-3 py-1.5 text-xs font-medium text-app">📖 Explainer</span>
            </div>

            <ul className="mt-6 space-y-3">
              {lenses.map((l) => (
                <li key={l.name} className="flex items-start gap-3 rounded-xl border border-app bg-surface p-3">
                  <span className="text-lg leading-none">{l.icon}</span>
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-app">
                      {l.name}
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">🤖 AI</span>
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{l.blurb}</p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm font-medium text-app">
              The bull case AND the bear case, fairly — and <span className="text-emerald-600 dark:text-emerald-400">you can&apos;t pay for a good rating.</span>
            </p>
            <p className="mt-1 text-xs text-faint">Free, independent, and cited to the filings. Always.</p>
          </div>

          {/* RIGHT — Paid, disclosed Sponsored Research Brief */}
          <div className="flex flex-col rounded-3xl border border-app bg-surface p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">PAID · DISCLOSED</span>
              <span className="text-xs font-medium text-faint">Ordered by the company, about itself</span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <h3 className="text-xl font-bold text-app">Sponsored Research Brief</h3>
            </div>
            <p className="mt-1">
              <span className="text-3xl font-bold text-app">$3,500</span>
              <span className="ml-2 text-sm text-faint">one-time</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Companies can order a thorough, AI-written, filing-based research brief about themselves to publish to their feed —
              clearly <span className="font-semibold text-app">disclosed as company-sponsored</span>, the way a sell-side initiation
              report carries its disclosure.
            </p>

            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-semibold text-app">You pay us to write it, not to rate it.</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Factual, filing-based, and it includes the risks. It carries a visible sponsorship disclosure and is kept
                clearly separate from the free, independent Both Sides panel — which it can never influence.
              </p>
            </div>

            <ul className="mt-5 space-y-2.5">
              {[
                "AI-written from your SEC filings — factual, not promotional",
                "Risk section included, like a real initiation report",
                "Visible “company-sponsored” disclosure on every brief",
                "Separate from the independent panel — it can't buy a rating",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted">
                  <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span> {f}
                </li>
              ))}
            </ul>

            <Link href="/sample-brief" className="mt-6 inline-flex items-center justify-center rounded-lg border border-emerald-500/40 px-4 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/10 dark:text-emerald-300">
              See a sample brief →
            </Link>
            <p className="mt-auto pt-4 text-xs text-faint">
              A fraction of the $15,000+ a traditional sponsored research report costs.
            </p>
          </div>
        </div>

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm text-faint">
          Two clearly separate things: the <span className="font-medium text-muted">free, independent panel</span> you can&apos;t buy,
          and a <span className="font-medium text-muted">disclosed, factual brief</span> a company pays to have written. That line is the whole point.
        </p>
      </div>
    </section>
  );
}

/* ----------------------- Why claim your company page --------------------- */
function WhyClaim() {
  const reasons = [
    { n: "1", title: "There's already a page about you", body: "PubcoZone generates a public page for your ticker whether you claim it or not — with your data, an AI bull/bear analysis, and investor questions. The only choice is whether you control it." },
    { n: "2", title: "Claiming gives you the verified voice", body: "A claimed page lets you post verified, officer-approved answers and updates — the one thing no anonymous account can do. Your word, on the record, above the noise." },
    { n: "3", title: "It already ranks", body: "These pages are built to show up when investors search your ticker. Claim now and you inherit a page Google already trusts, with content compounding — instead of starting from zero later." },
    { n: "4", title: "Silence is the real risk", body: "Unclaimed, your story is written by pumpers, bashers, and AI. A claimed page with a steady, compliant presence is how a small company stays visible, liquid, and fundable." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight text-app">Why your company should claim its page</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted">
        The page exists either way. Claiming it is how you turn a page <em>about</em> you into a page that works <em>for</em> you.
      </p>
      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {reasons.map((r) => (
          <div key={r.n} className="flex gap-4 rounded-2xl border border-app bg-surface p-6">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{r.n}</div>
            <div>
              <h3 className="text-lg font-semibold text-app">{r.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-10 text-center">
        <Link href="/login?type=company&mode=signup" className="inline-block rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
          Claim your company&apos;s page →
        </Link>
        <p className="mt-2 text-xs text-faint">Free to claim. Verification required.</p>
      </div>
    </section>
  );
}

/* --------------------------------- Stats --------------------------------- */
function Stats() {
  const stats = [
    ["11", "public data sources, in one score"],
    ["Minutes", "from a filing to a ready-to-post update"],
    ["You", "approve every post — nothing publishes without your tap"],
  ];
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="grid gap-8 text-center sm:grid-cols-3">
        {stats.map(([big, small]) => (
          <div key={small}>
            <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">{big}</p>
            <p className="mt-1 text-sm text-muted">{small}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------- Pricing -------------------------------- */
function Pricing() {
  const tiers = [
    { name: "Free", price: "$0", popular: false, features: ["A verified public page with live data", "Free AI Research Panel on your page", "Free Marketing Kit + share links", "Investors can find & follow you"] },
    { name: "Board", price: "$399", popular: false, features: ["Investor Q&A inbox — every question in one place", "AI-drafted, compliance-checked verified answers", "Instant alerts when investors ask", "Recurring question themes + board sentiment"] },
    { name: "Starter", price: "$1,500", popular: false, features: ["Everything in Board", "Filing-to-post AI drafting", "Reg FD green/yellow/red screening", "Multi-channel publishing (X, LinkedIn)", "Document vault + embeddable badges"] },
    { name: "Growth", price: "$3,500", popular: true, features: ["Everything in Starter", "Full IR CRM — contacts, deals, tasks", "Counsel Console + signed approvals", "Threat Radar + AI rebuttals", "13F investor targeting"] },
    { name: "Command", price: "$6,000", popular: false, features: ["Everything in Growth", "Quiet-period mode + custom voices", "Intelligence dashboard + board summaries", "Short-attack defense playbook", "Dedicated onboarding"] },
  ];
  return (
    <section id="pricing" className="border-y border-app bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">Simple pricing. Less than one junior hire.</h2>
        <p className="mt-3 text-center text-muted">A local IR agency charges $10,000+ a month to do less. Start owning your board for $399.</p>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {tiers.map((t) => (
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
              <Link href={t.name === "Free" ? "/login?type=company&mode=signup" : "/billing"} className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${t.popular ? "bg-emerald-600 text-white hover:bg-emerald-500" : "border border-app text-app hover:bg-app-hover"}`}>
                {t.name === "Free" ? "Claim free page" : "Get started"}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- Final CTA ------------------------------- */
function FinalCta() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  return (
    <section className="mx-auto max-w-4xl px-6 py-24 text-center">
      <h2 className="text-3xl font-bold tracking-tight text-app sm:text-4xl">Stop letting strangers write your story.</h2>
      <p className="mx-auto mt-4 max-w-xl text-muted">See exactly what investors find when they look you up — and what we&apos;d do about it. Free, instant, public data only.</p>
      <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 overflow-hidden rounded-xl border border-app bg-surface focus-within:border-emerald-500">
          <span className="flex items-center pl-4 text-faint">$</span>
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && ticker && router.push(`/t/${ticker}`)}
            placeholder="Your ticker" className="w-full bg-transparent px-2 py-3 uppercase text-app focus:outline-none" />
        </div>
        <button onClick={() => ticker && router.push(`/t/${ticker}`)} className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
          See your free report →
        </button>
      </div>
    </section>
  );
}


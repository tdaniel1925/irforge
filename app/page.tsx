"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

export default function Landing() {
  return (
    <div className="bg-app text-app">
      <Nav />
      <Hero />
      <LevelField />
      <LogoStrip />
      <Pillars />
      <HowItWorks />
      <Compliance />
      <Comparison />
      <Stats />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ---------------------------------- Nav ---------------------------------- */
function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-app bg-app/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-0.5 text-4xl font-bold tracking-tight">
          <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          <a href="#how" className="hover:text-app">How it works</a>
          <Link href="/how-its-legal" className="hover:text-app">Is it legal?</Link>
          <a href="#pricing" className="hover:text-app">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/app" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Open the app
          </Link>
        </div>
      </div>
    </header>
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
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> AI investor relations for public companies
          </div>
          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight text-app sm:text-5xl">
            Your investors are talking about you.{" "}
            <span className="text-emerald-600 dark:text-emerald-400">Now you can talk back — legally.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
            For years, message boards like InvestorsHub and StockTwits let anonymous pumpers and short-side bashers
            write your story — and you were legally gagged from answering. PubcoZone <span className="font-semibold text-app">levels the playing field</span>:
            it turns your SEC filings into compliant updates, answers shareholders from your public record, and
            lets you set the record straight — all approved by you with one tap.
          </p>
          <TickerLookup />
          <p className="mt-3 text-xs text-faint">Free report · no signup · uses only public data</p>
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
          placeholder="Enter your ticker — e.g. LAC"
          className="w-full bg-transparent px-2 py-3 text-app uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal focus:outline-none"
        />
      </div>
      <button
        onClick={() => ticker && router.push(`/t/${ticker}`)}
        className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        See your company&apos;s score →
      </button>
    </div>
  );
}

function HeroMock() {
  return (
    <div className="relative">
      <div className="rounded-2xl border border-app bg-surface p-5 shadow-xl shadow-slate-900/5">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">About your latest SEC filing</p>
        <p className="mb-3 text-sm font-medium text-app">We want to post this to X:</p>
        <div className="space-y-2">
          <div className="rounded-lg border border-app bg-surface-2 p-3 text-sm text-app">
            <span className="text-xs text-faint">@yourcompany · 1/3</span>
            <p className="mt-1">We just filed our Q1 results. Three numbers shareholders ask about most: cash, burn, and runway. 🧵</p>
          </div>
          <div className="rounded-lg border border-app bg-surface-2 p-3 text-sm text-app">
            <span className="text-xs text-faint">@yourcompany · 2/3</span>
            <p className="mt-1">$11.2M cash, zero debt. Runway extends past our next milestones. Full detail in the 10-Q on EDGAR.</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">✓ Approve &amp; let it post</button>
          <button className="rounded-lg border border-app px-3 py-2 text-sm text-app">✎ Edit</button>
          <button className="rounded-lg border border-app px-3 py-2 text-sm text-app">✕ Skip</button>
        </div>
        <p className="mt-3 text-center text-[11px] text-faint">Disclosures attach automatically on post. Nothing goes out until you tap.</p>
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
    { img: "/img/defend.png", title: "Defend", body: "When someone spreads false info or sentiment turns against you, you'll know within minutes — with a fact-based, filing-cited response ready to approve. On other platforms you're defenseless. Here you have a voice." },
    { img: "/img/grow.png", title: "Grow", body: "We turn every filing into investor content, answer questions from your public record, and track one Visibility Score — so you can prove it's working to your board." },
    { img: "/img/control.png", title: "Control", body: "Nothing posts without your tap. Every post carries your legal disclosures automatically. Every action is logged for your compliance record." },
  ];
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <h2 className="text-center text-3xl font-bold tracking-tight text-app">Three jobs. One platform. One number.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Everything PubcoZone does maps to defending your name, growing your reach, or keeping you in control — and all of it moves your Visibility Score.</p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {items.map((it) => (
          <div key={it.title} className="overflow-hidden rounded-2xl border border-app bg-surface">
            <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-app">
              <Image src={it.img} alt={it.title} fill className="object-cover" sizes="(max-width: 768px) 100vw, 33vw" />
            </div>
            <div className="p-6">
              <h3 className="text-lg font-semibold text-app">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ How it works ----------------------------- */
function HowItWorks() {
  const steps = [
    { n: 1, t: "Connect your ticker", b: "We pull your SEC filings and public data automatically — your profile is ready in minutes." },
    { n: 2, t: "We draft, you approve", b: "Read what we wrote, tap approve, and it posts to X with your legal disclosures attached. Edit or skip anything." },
    { n: 3, t: "Watch your score climb", b: "Track your Visibility Score over time, and hand the proof to your board." },
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
    "Nothing posts without a named human's approval",
    "Disclosures attach automatically — Section 17(b) + forward-looking statements",
    "AI answers only from your public filings — Reg FD-safe by design",
    "A complete audit log, ready for regulators or your exchange",
  ];
  return (
    <section id="compliance" className="mx-auto max-w-6xl px-6 py-20">
      <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/5 p-8 sm:p-12">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-app">Built for compliance, not around it.</h2>
            <p className="mt-3 text-muted">
              Promoting a public company is not like marketing a restaurant. PubcoZone is designed so the safe path is the only path —
              reviewed with securities counsel in mind, so the answer to &ldquo;is this legal?&rdquo; is always yes.
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
    ["Monthly cost", "$0", "$10,000+", "From $1,500"],
    ["Defends you from attacks", "No", "Rarely", "Yes — in minutes"],
    ["Answers shareholders legally", "No", "Slowly", "Yes — Reg FD-safe"],
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

/* --------------------------------- Stats --------------------------------- */
function Stats() {
  const stats = [
    ["11", "public data sources, in one score"],
    ["Minutes", "from a filing to a ready-to-post update"],
    ["100%", "of posts compliance-checked before you see them"],
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
    { name: "Starter", price: "$1,500", popular: false, features: ["Verified company page", "Filing-to-post drafting", "The investor board", "Monthly proof report"] },
    { name: "Growth", price: "$3,500", popular: true, features: ["Everything in Starter", "Threat Radar + AI rebuttals", "AI shareholder Q&A", "13F investor targeting", "Publishing to X"] },
    { name: "Command", price: "$6,000", popular: false, features: ["Everything in Growth", "Short-attack defense", "Earnings-call support", "Dedicated onboarding"] },
  ];
  return (
    <section id="pricing" className="border-y border-app bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold tracking-tight text-app">Simple pricing. Less than one junior hire.</h2>
        <p className="mt-3 text-center text-muted">A local IR agency charges $10,000+ a month to do less. Billed quarterly.</p>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <div key={t.name} className={`relative rounded-2xl border p-6 ${t.popular ? "border-emerald-500 bg-surface shadow-lg" : "border-app bg-surface"}`}>
              {t.popular && <span className="absolute -top-3 left-6 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">MOST POPULAR</span>}
              <h3 className="text-lg font-semibold text-app">{t.name}</h3>
              <p className="mt-2 text-3xl font-bold text-app">{t.price}<span className="text-base font-normal text-faint">/mo</span></p>
              <ul className="mt-5 space-y-2.5">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link href="/app" className={`mt-6 block rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${t.popular ? "bg-emerald-600 text-white hover:bg-emerald-500" : "border border-app text-app hover:bg-app-hover"}`}>
                Get started
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

/* -------------------------------- Footer --------------------------------- */
function Footer() {
  return (
    <footer className="border-t border-app">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Link href="/" className="flex items-baseline gap-0.5 text-lg font-bold">
              <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
            </Link>
            <p className="mt-2 max-w-xs text-sm text-faint">AI investor relations for public companies. Talk back to your investors — legally.</p>
          </div>
          <div className="flex gap-12 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-app">Product</p>
              <a href="#how" className="block text-muted hover:text-app">How it works</a>
              <a href="#pricing" className="block text-muted hover:text-app">Pricing</a>
              <Link href="/app" className="block text-muted hover:text-app">Open the app</Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-app">Company</p>
              <Link href="/how-its-legal" className="block text-muted hover:text-app">Is it legal?</Link>
              <Link href="/privacy" className="block text-muted hover:text-app">Privacy Policy</Link>
              <Link href="/terms" className="block text-muted hover:text-app">Terms &amp; Conditions</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-app pt-6 text-xs leading-relaxed text-faint">
          PubcoZone is a compensated service provider, not an investment adviser. Nothing on this site or produced by the
          platform is investment advice. All company data is drawn from public sources and may be incomplete or delayed.
          © {new Date().getFullYear()} PubcoZone.
        </div>
      </div>
    </footer>
  );
}

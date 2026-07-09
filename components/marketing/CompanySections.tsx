import Link from "next/link";
import Image from "next/image";

// Rich company-conversion marketing sections. Extracted from the old homepage so the
// dedicated /for-companies page owns the full IR pitch and the homepage can be a clean
// investor|company split. Server components — no client state.

/* ------------------------------ Compliance ------------------------------- */
export function Compliance() {
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
export function Comparison() {
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
export function PlatformComparison() {
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
  return <span className={`text-xs ${highlighted ? "font-semibold text-app" : "text-muted"}`}>{label || kind}</span>;
}

/* ----------------------- Both Sides + Sponsored Brief -------------------- */
export function BothSides() {
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
export function WhyClaim() {
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

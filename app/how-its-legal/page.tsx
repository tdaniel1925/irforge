import Link from "next/link";

export const metadata = {
  title: "How It's Legal to Respond to Investors — PubcoZone",
  description: "Public companies can legally answer shareholders on social media when disclosure is broad and fair. Here's the SEC guidance that makes it work, and how PubcoZone is built around it.",
};

export default function HowItsLegal() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">← Back to PubcoZone</Link>

      <h1 className="mt-6 text-3xl font-bold text-app">How it&apos;s legal for your company to respond to investors</h1>
      <p className="mt-3 text-lg text-muted">
        The short version: you&apos;ve always been allowed to talk to your shareholders — what the law restricts is talking to <em>some</em> of them privately about <em>material</em> things. PubcoZone is built so every answer you give is broad, fair, public disclosure. Here&apos;s exactly why that works.
      </p>

      <div className="mt-10 space-y-8 text-sm leading-relaxed text-muted">
        <Card n="1" title="The rule everyone&apos;s afraid of: Regulation FD">
          <p>Regulation FD (&ldquo;Fair Disclosure&rdquo;), adopted by the SEC in 2000, says a public company can&apos;t selectively share <strong>material non-public information</strong> with analysts or favored investors before telling the broad market. This is the real reason most companies go silent on message boards — they&apos;re not banned from speaking; they&apos;re afraid of <em>selectively</em> speaking.</p>
          <p>The key phrase is <strong>material non-public information</strong>. Reg FD is about information that (a) would matter to a reasonable investor&apos;s trading decision and (b) hasn&apos;t been made public yet. Repeating what&apos;s already in your filings is not covered. The rule targets <em>new</em>, market-moving information shared <em>narrowly</em>.</p>
        </Card>

        <Card n="2" title="The 2013 SEC ruling that changed everything">
          <p>In April 2013, the SEC issued guidance (following its review of a Netflix CEO Facebook post) confirming that <strong>social media can be a legitimate channel for public disclosure under Regulation FD</strong> — <em>provided investors have been told, in advance, which channels the company uses</em> to announce material information.</p>
          <p>This is the legal foundation PubcoZone is built on. Once your company has notified investors that it discloses through, say, your X account and your company page, an announcement made there reaches everyone at once — which makes it broad public disclosure, not a selective tip. The SEC explicitly put company social media on the same footing as a press release or an 8-K, when used this way.</p>
        </Card>

        <Card n="3" title="Two things make a company answer legal">
          <p>Putting Reg FD and the 2013 guidance together, a company can safely answer shareholders when both are true:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>The answer is broadly disseminated, not private.</strong> It goes out to everyone simultaneously through a declared channel — not whispered to one investor.</li>
            <li><strong>The answer doesn&apos;t reveal new material non-public information.</strong> It draws on what&apos;s already in your public filings, or it&apos;s itself a proper simultaneous public disclosure.</li>
          </ul>
          <p>Answer from the public record, broadcast to all, and you are on the same ground as issuing a press release.</p>
        </Card>

        <Card n="4" title="The controls PubcoZone gives you — you make the call">
          <p>PubcoZone doesn&apos;t decide what&apos;s compliant; <em>you and your counsel</em> do. What the platform does is give you the controls to run a careful disclosure process, and keep you in charge of every one of them:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Citation-grounded drafts.</strong> When an investor asks a question, our AI drafts a reply using only your public filings. If a question looks like it would require non-public information, it&apos;s flagged for your review and the draft points to your official disclosures rather than answering — but you always decide what actually goes out.</li>
            <li><strong>Simultaneous, broad publication.</strong> When you approve an answer, it publishes to your public page <em>and</em> your X account at the same moment — broad dissemination through your declared channels. That simultaneity is what the SEC&apos;s fair-disclosure standard looks for — broad, public dissemination rather than a selective response.</li>
            <li><strong>A named human approves everything.</strong> Nothing is ever posted automatically. Your designated officer (CFO, IR head, or counsel) reviews and approves each answer before it goes out.</li>
            <li><strong>A complete audit log.</strong> Every question, draft, approval, and publication is recorded — the report you can hand a regulator or exchange if they ever ask.</li>
          </ul>
        </Card>

        <Card n="5" title="The one setup step your counsel will recognize">
          <p>To rely on the 2013 guidance, your company should <strong>identify its disclosure channels in advance</strong> — typically a single sentence added to your investor-relations policy or a periodic filing, stating that the company may disclose material information through its website and designated social-media accounts, and directing investors to follow them. Your securities counsel will recognize this immediately; it&apos;s the standard step companies took after the Netflix guidance. PubcoZone&apos;s onboarding sets up your declared channels so this is straightforward.</p>
        </Card>

        <Card n="6" title="What this is not">
          <p>PubcoZone is not a substitute for your securities counsel, and it does not certify that any post is legal — you and your counsel are responsible for what you approve. You should never use it to: predict your stock price, tell anyone to buy or sell, hype or promote, or share information that isn&apos;t public. Those aren&apos;t Reg FD issues — they&apos;re anti-fraud and anti-touting issues (including Section 17(b), the rule requiring paid promoters to disclose their compensation). Our first-pass filter flags that kind of language for your review — it&apos;s an assist, not a guarantee — and every post you approve carries the compensated-provider and forward-looking-statements disclosures you&apos;ve set, attached automatically.</p>
        </Card>

        <div className="rounded-xl border border-app bg-surface-2 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Important</p>
          <p className="mt-1 text-sm text-muted">This page is educational and is not legal advice. The securities laws contain exceptions and turn on specific facts. Confirm your disclosure policy and practices with your own securities counsel before relying on any of the above. PubcoZone is a compensated service provider, not a law firm.</p>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Primary sources</p>
          <ul className="space-y-1">
            <li><a href="https://www.sec.gov/rules/final/33-7881.htm" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">SEC — Final Rule: Regulation FD (Release 33-7881) ↗</a></li>
            <li><a href="https://www.sec.gov/litigation/investreport/34-69279.htm" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">SEC — Report on Netflix &amp; social-media disclosure (2013, Release 34-69279) ↗</a></li>
            <li><a href="https://www.sec.gov/news/press-release/2013-2013-51htm" target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">SEC — Press release: social media OK for company announcements ↗</a></li>
          </ul>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
          <p className="text-lg font-semibold text-app">Ready to answer your shareholders — safely?</p>
          <p className="mt-1 text-sm text-muted">See what investors are asking about your company, and how PubcoZone helps you respond on the record.</p>
          <Link href="/" className="mt-4 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">See your company&apos;s page →</Link>
        </div>
      </div>
    </div>
  );
}

function Card({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-app bg-surface p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{n}</span>
        <h2 className="text-lg font-semibold text-app">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

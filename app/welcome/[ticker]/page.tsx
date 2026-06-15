import type { Metadata } from "next";
import Link from "next/link";
import { getPublicTickerAudit } from "@/lib/tickerCache";

export const dynamic = "force-dynamic";

interface Props { params: { ticker: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = params.ticker.toUpperCase();
  const title = `$${t} — Real answers, on the record | PubcoZone`;
  const description = `Get straight, fair, AI-balanced information about $${t} — and ask the company directly. No anonymous pump-and-dump. The real conversation is on PubcoZone.`;
  return {
    title,
    description,
    alternates: { canonical: `https://pubcozone.com/welcome/${t}` },
    openGraph: { title, description, url: `https://pubcozone.com/welcome/${t}`, type: "website", siteName: "PubcoZone", images: [`https://pubcozone.com/api/og/${t}.svg`] },
    twitter: { card: "summary_large_image", title, description, images: [`https://pubcozone.com/api/og/${t}.svg`] },
  };
}

export default async function WelcomePage({ params }: Props) {
  const ticker = params.ticker.toUpperCase().slice(0, 8);
  let name = `$${ticker}`;
  try {
    const a = await getPublicTickerAudit(ticker);
    if (a.companyName) name = a.companyName;
  } catch { /* fall back to ticker */ }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-300">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
        Real conversations happening now
      </div>

      <h1 className="text-4xl font-extrabold tracking-tight text-app sm:text-5xl">
        Investors in <span className="text-emerald-600 dark:text-emerald-400">{name}</span> —
        <br />get the real story.
      </h1>

      <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
        Tired of slushing through anonymous pumps and bashers on StockTwits and InvestorsHub?
        On PubcoZone, the information is <span className="font-semibold text-app">real, fair, and balanced</span> —
        powered by AI and your right to filter the noise. And the company answers questions <span className="font-semibold text-app">on the record</span>.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={`/t/${ticker}`} className="rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-500">
          See the real ${ticker} page →
        </Link>
        <Link href={`/t/${ticker}#ask`} className="rounded-xl border border-app px-6 py-3 text-base font-medium text-app transition hover:bg-app-hover">
          Ask the company
        </Link>
      </div>

      {/* Why it's different */}
      <div className="mt-12 grid gap-4 text-left sm:grid-cols-3">
        {[
          { icon: "🛡️", t: "AI-moderated", d: "Hype and FUD are labeled. You filter what you see." },
          { icon: "✅", t: "On the record", d: "The company answers — verified, compliant, in public." },
          { icon: "⚖️", t: "Fair & balanced", d: "Real filings and data, not anonymous noise." },
        ].map((c) => (
          <div key={c.t} className="rounded-xl border border-app bg-surface p-4">
            <div className="text-2xl">{c.icon}</div>
            <p className="mt-1.5 font-semibold text-app">{c.t}</p>
            <p className="mt-0.5 text-sm text-muted">{c.d}</p>
          </div>
        ))}
      </div>

      <p className="mt-10 text-xs text-faint">
        PubcoZone is where {name} engages investors honestly. <Link href="/" className="text-emerald-600 hover:underline dark:text-emerald-400">What is PubcoZone?</Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getSampleBrief } from "@/lib/briefs";
import BriefReader from "@/components/BriefReader";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const title = "Sample Sponsored Research Brief | PubcoZone";
  const description =
    "See exactly what a PubcoZone Sponsored Research Brief looks like — a thorough, factual, filing-based company profile, clearly disclosed. This is an illustrative sample.";
  return {
    title,
    description,
    alternates: { canonical: "https://pubcozone.com/sample-brief" },
    openGraph: { title, description, url: "https://pubcozone.com/sample-brief", siteName: "PubcoZone", type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SampleBriefPage() {
  const brief = await getSampleBrief();

  return (
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-8">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-app">← Back to PubcoZone</Link>
        <Link href="/#pricing" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">See pricing</Link>
      </div>

      <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
        SAMPLE · illustrative example
      </div>
      <h1 className="text-3xl font-bold tracking-tight text-app">What a Sponsored Research Brief looks like</h1>
      <p className="mt-3 max-w-2xl text-muted">
        A Sponsored Research Brief is a thorough, factual profile of your company — prepared by AI from your public SEC
        filings, balanced, with a real risk section, and clearly disclosed as company-sponsored. Here&apos;s a full example.
      </p>

      {!brief ? (
        <div className="mt-10 rounded-2xl border border-app bg-surface p-8 text-center">
          <p className="text-muted">The sample brief isn&apos;t available right now. Check back shortly.</p>
        </div>
      ) : (
        <article className="mt-8 overflow-hidden rounded-2xl border border-app bg-surface">
          <div className="border-b border-app bg-surface-2/50 px-6 py-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-300">${brief.ticker}</span>
              <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">Sample brief</span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-app">{brief.title}</h2>
          </div>
          <div className="px-6 py-6">
            <BriefReader markdown={brief.markdown} />
            <p className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
              {brief.disclosure}
            </p>
          </div>
        </article>
      )}

      {/* CTA */}
      <div className="mt-10 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.04] p-6 text-center">
        <h3 className="text-lg font-bold text-app">Want a brief like this for your company?</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          $3,500, one-time. AI writes it from your filings, you review it, and you publish it to your feed when it&apos;s ready.
          You&apos;re paying us to <span className="font-medium text-app">write</span> it, not to rate it.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <Link href="/briefs" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Order a brief →
          </Link>
          <Link href="/#pricing" className="rounded-lg border border-app px-5 py-2.5 text-sm font-semibold text-app transition hover:bg-app-hover">
            See all plans
          </Link>
        </div>
      </div>
    </div>
  );
}

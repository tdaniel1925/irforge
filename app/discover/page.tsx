import type { Metadata } from "next";
import Link from "next/link";
import { getDiscovery, type DiscoveryRow } from "@/lib/publicStats";
import { getQuotes, type Quote } from "@/lib/quotes";
import DiscoverTabs from "@/components/DiscoverTabs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const metadata: Metadata = {
  title: "Discover — Trending & Most-Watched Stocks | PubcoZone",
  description:
    "The most-read, most-active, and trending public-company pages on PubcoZone. Live investor visibility, real SEC data, and an AI-moderated board — not pump-and-dump noise.",
  alternates: { canonical: "https://pubcozone.com/discover" },
  openGraph: {
    title: "Discover trending stocks — PubcoZone",
    description: "Most-read, most-active, and trending tickers. Real data, moderated discussion.",
    url: "https://pubcozone.com/discover",
    type: "website",
    siteName: "PubcoZone",
  },
};

export default async function DiscoverPage() {
  let discovery;
  try {
    discovery = await getDiscovery(20);
  } catch (e) {
    console.error("[discover] aggregation failed:", e);
    discovery = null;
  }

  // Enrich every ranked ticker with a light quote (one batch call).
  const allTickers = discovery
    ? Array.from(
        new Set(
          [
            ...discovery.mostRead,
            ...discovery.mostActive,
            ...discovery.trending,
            ...discovery.mostPosted,
            ...discovery.recent,
          ].map((r) => r.ticker)
        )
      )
    : [];
  let quotes: Record<string, Quote> = {};
  try {
    quotes = await getQuotes(allTickers);
  } catch {
    quotes = {};
  }

  const empty = !discovery || discovery.totalTickers === 0;

  return (
    <div className="mx-auto max-w-5xl pb-16">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="text-3xl font-bold text-white">Discover</h1>
          <p className="mt-1 text-sm text-slate-400">
            The most-read, most-active, and trending company pages on PubcoZone — live data, moderated discussion,{" "}
            <span className="text-emerald-400">no pump-and-dump.</span>
          </p>
        </div>
        <Link
          href="/t"
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          🔍 Look up any ticker
        </Link>
      </div>

      {empty ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <p className="text-lg font-semibold text-white">The boards are warming up.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            Rankings appear as investors view pages and post to boards. Be the first —{" "}
            <Link href="/t" className="text-emerald-400 hover:underline">
              pull a report on any ticker
            </Link>{" "}
            to put it on the map.
          </p>
        </div>
      ) : (
        <DiscoverTabs
          mostRead={serialize(discovery!.mostRead, quotes)}
          mostActive={serialize(discovery!.mostActive, quotes)}
          trending={serialize(discovery!.trending, quotes)}
          mostPosted={serialize(discovery!.mostPosted, quotes)}
          recent={serialize(discovery!.recent, quotes)}
          totalTickers={discovery!.totalTickers}
        />
      )}

      <p className="mt-10 text-xs leading-relaxed text-slate-600">
        Rankings reflect engagement on PubcoZone (page views and board activity) plus live market data from public
        sources, refreshed continuously. Not investment advice. High activity is not an endorsement — it just means
        people are talking. Read the data and the company&apos;s own answers before deciding anything.
      </p>
    </div>
  );
}

// Merge engagement rows with quotes into the flat shape the client table wants.
function serialize(rows: DiscoveryRow[], quotes: Record<string, Quote>) {
  return rows.map((r) => {
    const q = quotes[r.ticker];
    return {
      ticker: r.ticker,
      views: r.views,
      posts: r.posts,
      posts24h: r.posts24h,
      lastActivity: r.lastActivity,
      price: q?.price ?? null,
      changePct: q?.changePct ?? null,
      volume: q?.volume ?? null,
      currency: q?.currency ?? "USD",
    };
  });
}

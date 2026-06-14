import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMember, getMyWatches } from "@/lib/members";
import WatchlistItem from "@/components/WatchlistItem";

export const dynamic = "force-dynamic";

export default async function MemberWatchlist() {
  const me = await getMyMember();
  if (!me) redirect("/login");
  const watches = await getMyWatches(me.id);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-app">Your watchlist</h1>
      <p className="mt-1 text-sm text-muted">Tickers you&apos;re watching. You get alerts on new filings, insider trades, halts, and grade changes.</p>

      {watches.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-app p-10 text-center">
          <p className="text-sm font-medium text-app">No tickers yet.</p>
          <p className="mt-1 text-sm text-muted">
            Open any company page and tap <span className="font-semibold">🔔 Watch</span> — or{" "}
            <Link href="/discover" className="text-emerald-600 hover:underline dark:text-emerald-400">browse what&apos;s trending</Link>.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-2">
          {watches.map((w) => (
            <WatchlistItem key={w.ticker} ticker={w.ticker} since={w.ts} />
          ))}
        </div>
      )}
    </div>
  );
}

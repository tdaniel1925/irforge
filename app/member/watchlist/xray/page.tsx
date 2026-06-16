import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyMember, getMyWatches } from "@/lib/members";
import { getStatRowsForTickers } from "@/lib/companyStats";
import { buildPortfolioXray, narratePortfolioXray } from "@/lib/portfolioXray";
import PortfolioXray from "@/components/PortfolioXray";

export const dynamic = "force-dynamic";

export default async function PortfolioXrayPage() {
  const me = await getMyMember();
  if (!me) redirect("/login");

  const watches = await getMyWatches(me.id);
  const tickers = watches.map((w) => w.ticker);
  const rows = await getStatRowsForTickers(tickers);

  const data = buildPortfolioXray(rows);
  const narrative = await narratePortfolioXray(data);

  // Watched tickers with no snapshot row — surfaced separately, not as facts.
  const covered = new Set(rows.map((r) => r.ticker.toUpperCase()));
  const missing = tickers.filter((t) => !covered.has(t.toUpperCase()));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-app">Portfolio x-ray</h1>
        <Link
          href="/member/watchlist"
          className="text-sm text-emerald-600 hover:underline dark:text-emerald-400"
        >
          ← Back to watchlist
        </Link>
      </div>
      <p className="mt-1 text-sm text-muted">
        Dilution, runway, and short-interest figures across the tickers you watch — straight from the
        filings and market data.
      </p>

      {watches.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-app p-10 text-center">
          <p className="text-sm font-medium text-app">No tickers to x-ray yet.</p>
          <p className="mt-1 text-sm text-muted">
            Add tickers from any company page, then come back here.{" "}
            <Link href="/discover" className="text-emerald-600 hover:underline dark:text-emerald-400">
              Browse what&apos;s trending
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <PortfolioXray data={data} missing={missing} narrative={narrative} />
        </div>
      )}
    </div>
  );
}

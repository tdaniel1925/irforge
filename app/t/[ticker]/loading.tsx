export default function LoadingTickerPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-8 text-sm text-slate-400">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
        Scanning live public sources — SEC EDGAR, StockTwits, Reddit, Yahoo Finance, GDELT. Usually under 15 seconds…
      </div>
    </div>
  );
}

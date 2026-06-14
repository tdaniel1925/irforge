"use client";

import { useEffect } from "react";
import Link from "next/link";

// Error boundary for the public ticker page. Without this, any thrown error in
// the server render shows Next's bare "Application error / Digest: …" screen.
// Here we (a) log the real error so it shows in the browser console + Vercel
// logs, and (b) give the visitor a recoverable, on-brand page with a retry.
export default function TickerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaces the actual message/stack in the console and (via Next) server logs.
    console.error("[ticker page error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-500/40 text-3xl">
        ⚠
      </div>
      <h1 className="text-2xl font-semibold text-white">This report hit a snag</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        We pull this page live from a dozen public data sources. One of them just
        misbehaved while building the report. This is almost always temporary.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400"
        >
          Try again
        </button>
        <Link
          href="/t"
          className="rounded-lg border border-slate-700 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
        >
          ← All ticker reports
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-[11px] text-slate-600">ref: {error.digest}</p>
      )}
    </div>
  );
}

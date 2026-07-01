"use client";

import { useEffect } from "react";
import Link from "next/link";

// App-wide error boundary. Without this, a thrown error in any server-component page
// (e.g. a failed Supabase call in /crm, /stakeholders, /intelligence, /counsel,
// /marketing-kit) shows Next's bare "Application error" screen. This gives a
// recoverable, on-brand page with a retry, and logs the real error to the console +
// server logs. Route-level error.tsx files (e.g. /t/[ticker]) still override this.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-amber-500/40 text-3xl">⚠</div>
      <h1 className="text-2xl font-semibold text-app">This page hit a snag</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Something went wrong loading this page — usually a temporary hiccup fetching your
        data. Try again, and if it keeps happening let us know.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button onClick={reset} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Try again
        </button>
        <Link href="/app" className="rounded-lg border border-app px-5 py-2 text-sm font-medium text-app transition hover:bg-app-hover">
          ← Back to Home
        </Link>
      </div>
      {error.digest && <p className="mt-6 font-mono text-[11px] text-faint">ref: {error.digest}</p>}
    </div>
  );
}

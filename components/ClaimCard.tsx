import Link from "next/link";

// Claim banner on an unclaimed public page. Routes to /verify — a real ownership
// verification flow (authorization doc + government ID of the named person), reviewed
// by our team — so the "verified company" badge actually means something. Shown at the
// top AND bottom of the ticker page.
export default function ClaimCard({ ticker }: { ticker: string }) {
  const claimHref = `/verify?ticker=${encodeURIComponent(ticker)}`;

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-md">
          <p className="text-xs font-bold tracking-wider text-amber-600 dark:text-amber-400">UNCLAIMED PAGE</p>
          <h2 className="mt-1 text-lg font-semibold text-app">Is this your company? Everything on this page is happening without you.</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            <li>✓ Verified company badge — investors know it&apos;s really you</li>
            <li>✓ Answer the questions on this page, compliance-checked, from your public record</li>
            <li>✓ Publish updates the moment you file — with disclosures handled automatically</li>
            <li>✓ Raise the grade at the top of this page, and watch it move monthly</li>
          </ul>
        </div>
        <div className="w-full max-w-xs">
          <div className="rounded-xl border border-amber-500/30 bg-surface p-4">
            <p className="text-sm font-semibold text-app">Claim ${ticker} in about 2 minutes</p>
            <ol className="mt-2 space-y-1 text-xs text-muted">
              <li><span className="font-semibold text-app">1.</span> Tell us who you are at the company</li>
              <li><span className="font-semibold text-app">2.</span> Upload proof — an authorization/filing + your ID</li>
              <li><span className="font-semibold text-app">3.</span> We verify you (~1 business day) and your page goes live</li>
            </ol>
            <Link
              href={claimHref}
              className="mt-3 block w-full rounded-lg bg-amber-500 px-4 py-2.5 text-center text-sm font-bold text-white transition hover:bg-amber-400"
            >
              Claim &amp; verify ${ticker} →
            </Link>
            <p className="mt-2 text-center text-[11px] text-faint">Free to claim · ownership verified by our team</p>
          </div>
        </div>
      </div>
    </div>
  );
}

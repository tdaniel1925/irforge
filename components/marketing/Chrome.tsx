"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// Shared marketing chrome (nav + footer) used by the hub (/), /for-investors, and
// /for-companies so the three pages stay visually consistent. The nav adapts its
// links to the audience so each page points people at the right next step.

export function MarketingNav({ audience = "hub" }: { audience?: "hub" | "investors" | "companies" }) {
  return (
    <header className="sticky top-0 z-30 border-b border-app bg-app/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-0.5 text-4xl font-bold tracking-tight">
          <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          {audience === "companies" ? (
            <>
              <a href="#how" className="hover:text-app">How it works</a>
              <Link href="/how-its-legal" className="hover:text-app">Is it legal?</Link>
              <a href="#pricing" className="hover:text-app">Pricing</a>
              <Link href="/for-investors" className="hover:text-app">For investors</Link>
            </>
          ) : audience === "investors" ? (
            <>
              <Link href="/discover" className="hover:text-app">Discover</Link>
              <Link href="/t" className="hover:text-app">Look up a stock</Link>
              <Link href="/sample-brief" className="hover:text-app">Sample brief</Link>
              <Link href="/for-companies" className="hover:text-app">For companies</Link>
            </>
          ) : (
            <>
              <Link href="/for-companies" className="hover:text-app">For companies</Link>
              <Link href="/for-investors" className="hover:text-app">For investors</Link>
              <Link href="/discover" className="hover:text-app">Discover</Link>
              <Link href="/how-its-legal" className="hover:text-app">Is it legal?</Link>
            </>
          )}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {audience === "investors" ? (
            <Link href="/login" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Join free
            </Link>
          ) : (
            <Link href="/app" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Open the app
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-app">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Link href="/" className="flex items-baseline gap-0.5 text-lg font-bold">
              <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
            </Link>
            <p className="mt-2 max-w-xs text-sm text-faint">Where public companies and investors meet on the record — facts over noise.</p>
          </div>
          <div className="flex flex-wrap gap-12 text-sm">
            <div className="space-y-2">
              <p className="font-medium text-app">For companies</p>
              <Link href="/for-companies" className="block text-muted hover:text-app">Overview</Link>
              <Link href="/for-companies#pricing" className="block text-muted hover:text-app">Pricing</Link>
              <Link href="/app" className="block text-muted hover:text-app">Open the app</Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-app">For investors</p>
              <Link href="/for-investors" className="block text-muted hover:text-app">Overview</Link>
              <Link href="/discover" className="block text-muted hover:text-app">Discover</Link>
              <Link href="/t" className="block text-muted hover:text-app">Look up a stock</Link>
            </div>
            <div className="space-y-2">
              <p className="font-medium text-app">Company</p>
              <Link href="/how-its-legal" className="block text-muted hover:text-app">Is it legal?</Link>
              <Link href="/privacy" className="block text-muted hover:text-app">Privacy Policy</Link>
              <Link href="/terms" className="block text-muted hover:text-app">Terms &amp; Conditions</Link>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-app pt-6 text-xs leading-relaxed text-faint">
          PubcoZone is a compensated service provider, not an investment adviser. Nothing on this site or produced by the
          platform is investment advice. All company data is drawn from public sources and may be incomplete or delayed.
          © {new Date().getFullYear()} PubcoZone.
        </div>
      </div>
    </footer>
  );
}

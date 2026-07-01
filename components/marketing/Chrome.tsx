"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { createClient } from "@/lib/supabase/client";

// Shared marketing chrome (nav + footer) used by the hub (/), /for-investors, and
// /for-companies so the three pages stay visually consistent. The nav adapts its
// links to the audience so each page points people at the right next step.

// One nav for every marketing page. Links are absolute (page + anchor) so they
// always resolve no matter which page you're on — no broken bare "#pricing".
// The active audience just gets its link highlighted; the link set is identical.
const NAV_LINKS = [
  { href: "/for-companies", label: "For companies", key: "companies" as const },
  { href: "/for-investors", label: "For investors", key: "investors" as const },
  { href: "/discover", label: "Discover", key: "discover" as const },
  { href: "/how-its-legal", label: "Is it legal?", key: "legal" as const },
];

export function MarketingNav({ audience = "hub" }: { audience?: "hub" | "investors" | "companies" }) {
  // Auth-aware CTA: signed-in users get "Open the app"; signed-out visitors get
  // "Log in". Checked client-side (these pages are static client components). Start
  // as null (unknown) so we never flash "Open the app" at a logged-out visitor —
  // we show the neutral "Log in" until we know, then upgrade if they're signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    createClient().auth.getUser()
      .then(({ data }) => { if (active) setSignedIn(Boolean(data.user)); })
      .catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-app bg-app/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-baseline gap-0.5 text-4xl font-bold tracking-tight">
          <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted sm:flex">
          {NAV_LINKS.map((l) => {
            const active = l.key === audience;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={active ? "font-semibold text-app" : "hover:text-app"}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {signedIn ? (
            // Logged in — go straight to the app.
            <Link href="/app" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Open the app
            </Link>
          ) : (
            // Logged out — show Log in, plus the audience-appropriate sign-up CTA.
            <>
              <Link href="/login" className="text-sm font-medium text-muted transition hover:text-app">
                Log in
              </Link>
              <Link href={audience === "investors" ? "/login?type=investor&mode=signup" : "/login?type=company&mode=signup"} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
                {audience === "investors" ? "Join free" : "Get started"}
              </Link>
            </>
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

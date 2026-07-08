"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BackButton from "./BackButton";

const NAV = [
  { href: "/member", label: "Overview", icon: "🏠" },
  { href: "/member/profile", label: "Profile", icon: "👤" },
  { href: "/member/watchlist", label: "Watchlist", icon: "⭐" },
  { href: "/member/activity", label: "My activity", icon: "💬" },
  { href: "/member/billing", label: "Membership", icon: "💳" },
];

export default function MemberShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [pathname]);

  const signOut = async () => {
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/");
  };

  return (
    <div className="flex min-h-screen">
      {navOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} aria-hidden />}
      <aside className={`z-50 flex h-screen w-64 shrink-0 flex-col border-r border-app bg-surface transition-transform lg:static lg:h-auto lg:w-56 lg:translate-x-0 max-lg:fixed max-lg:inset-y-0 max-lg:left-0 ${navOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-5">
          <Link href="/" onClick={() => setNavOpen(false)} className="flex items-baseline gap-0.5 text-2xl font-bold tracking-tight">
            <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
          </Link>
          <button onClick={() => setNavOpen(false)} className="rounded-lg p-1 text-muted hover:bg-app-hover hover:text-app lg:hidden" aria-label="Close menu">✕</button>
        </div>
        <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Investor account</p>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2">
          {NAV.map((n) => {
            const active = n.href === "/member" ? pathname === "/member" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setNavOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-300" : "text-muted hover:bg-app-hover hover:text-app"}`}
              >
                <span>{n.icon}</span> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-0.5 border-t border-app px-2 py-3">
          <Link href="/discover" onClick={() => setNavOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-app-hover hover:text-app">
            🔥 Discover
          </Link>
          <Link href="/t" onClick={() => setNavOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-app-hover hover:text-app">
            🔎 Look up a ticker
          </Link>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-app-hover hover:text-app">
            ↩ Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
        {/* Mobile top bar: hamburger + back. */}
        <div className="mb-4 flex items-center gap-2 lg:mb-0">
          <button onClick={() => setNavOpen(true)} className="-ml-1 rounded-lg p-1.5 text-app hover:bg-app-hover lg:hidden" aria-label="Open menu">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          {pathname !== "/member" && <BackButton fallback="/member" />}
        </div>
        {children}
      </main>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      <aside className="flex w-56 shrink-0 flex-col border-r border-app bg-surface">
        <Link href="/" className="flex items-baseline gap-0.5 px-5 py-5 text-2xl font-bold tracking-tight">
          <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>
        <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-wide text-faint">Investor account</p>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map((n) => {
            const active = n.href === "/member" ? pathname === "/member" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-300" : "text-muted hover:bg-app-hover hover:text-app"}`}
              >
                <span>{n.icon}</span> {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-0.5 border-t border-app px-2 py-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-app-hover hover:text-app">
            ← Home
          </Link>
          <Link href="/discover" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-app-hover hover:text-app">
            🔥 Discover
          </Link>
          <Link href="/t" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-app-hover hover:text-app">
            🔎 Look up a ticker
          </Link>
          <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-app-hover hover:text-app">
            ↩ Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}

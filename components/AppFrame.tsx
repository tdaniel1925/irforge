"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

// The landing page (/) and other public routes render full-bleed with no app sidebar —
// these are what a logged-out visitor (e.g. someone running a free ticker report) sees.
// Everything else gets the dashboard shell.
const BARE_EXACT = ["/", "/login", "/privacy", "/terms", "/how-its-legal", "/t"];
const BARE_PREFIXES = ["/t/"]; // public ticker report pages: /t/LAC etc.

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_EXACT.includes(pathname) || BARE_PREFIXES.some((p) => pathname.startsWith(p));

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}

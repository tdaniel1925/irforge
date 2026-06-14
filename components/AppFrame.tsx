"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import FreeTierBanner from "./FreeTierBanner";
import FeatureGate from "./FeatureGate";
import type { Feature } from "@/lib/billing";

// The landing page (/) and other public routes render full-bleed with no app sidebar —
// these are what a logged-out visitor (e.g. someone running a free ticker report) sees.
// Everything else gets the dashboard shell.
const BARE_EXACT = ["/", "/login", "/privacy", "/terms", "/how-its-legal", "/t"];
const BARE_PREFIXES = ["/t/"]; // public ticker report pages: /t/LAC etc.

// Which paid feature each dashboard route requires. Routes not listed (settings,
// billing, admin, onboarding) are always reachable when logged in.
const ROUTE_FEATURE: Record<string, Feature> = {
  "/app": "approvals",
  "/do": "approvals",
  "/approvals": "approvals",
  "/filings": "approvals",
  "/mentions": "approvals",
  "/proof": "proof",
  "/documents": "vault",
  "/company": "threats",
  "/crm": "crm",
  "/studio": "studio",
  "/calendar": "calendar",
  "/captable": "captable",
  "/analyzer": "analyzer",
};

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = BARE_EXACT.includes(pathname) || BARE_PREFIXES.some((p) => pathname.startsWith(p));

  if (bare) return <>{children}</>;

  const feature = ROUTE_FEATURE[pathname];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 p-8">
        <FreeTierBanner />
        {feature ? <FeatureGate feature={feature}>{children}</FeatureGate> : children}
      </main>
    </div>
  );
}

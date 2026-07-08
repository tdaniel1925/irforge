"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MemberShell from "./MemberShell";
import FreeTierBanner from "./FreeTierBanner";
import FeatureGate from "./FeatureGate";
import UserMenu from "./UserMenu";
import WelcomeModal from "./WelcomeModal";
import BackButton from "./BackButton";
import AiChat from "./AiChat";
import ImpersonationBanner from "./ImpersonationBanner";
import CommsSidebar from "./CommsSidebar";
import type { Feature } from "@/lib/billing";

// The landing page (/) and other public routes render full-bleed with no app sidebar —
// these are what a logged-out visitor (e.g. someone running a free ticker report) sees.
// Everything else gets the dashboard shell.
const BARE_EXACT = ["/", "/login", "/privacy", "/terms", "/how-its-legal", "/t", "/discover", "/sample-brief", "/for-investors", "/for-companies", "/accept-invite"];
const BARE_PREFIXES = ["/t/", "/embed/", "/welcome/"]; // public ticker pages + embeds + investor welcome pages

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
  // Mobile nav drawer state (lifted so the hamburger, overlay, and Sidebar agree).
  const [navOpen, setNavOpen] = useState(false);
  // Close the drawer on route change (defensive — links also close it directly).
  useEffect(() => { setNavOpen(false); }, [pathname]);
  const bare = BARE_EXACT.includes(pathname) || BARE_PREFIXES.some((p) => pathname.startsWith(p));

  if (bare) return <>{children}</>;

  // Member (individual investor) back office gets its own shell, not the company
  // dashboard sidebar / tier gating.
  if (pathname.startsWith("/member")) return <MemberShell>{children}</MemberShell>;

  const feature = ROUTE_FEATURE[pathname];

  return (
    <div className="flex min-h-screen">
      <Sidebar mobileOpen={navOpen} onNavigate={() => setNavOpen(false)} />
      <main className="flex min-w-0 flex-1 flex-col">
        <ImpersonationBanner />
        {/* Top bar: hamburger (mobile) + Back (left) + account dropdown (right). */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-app bg-app/80 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNavOpen(true)}
              className="-ml-1 rounded-lg p-1.5 text-app hover:bg-app-hover lg:hidden"
              aria-label="Open menu"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            {pathname !== "/app" ? <BackButton fallback="/app" /> : <span />}
          </div>
          <UserMenu />
        </header>
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <FreeTierBanner />
          {feature ? <FeatureGate feature={feature}>{children}</FeatureGate> : children}
        </div>
      </main>
      {/* Right comms rail: team presence + chat. Hidden on mobile (not a mobile-first
          need, and it would eat the whole screen); returns on >=lg. */}
      <div className="hidden lg:flex"><CommsSidebar /></div>
      <WelcomeModal />
      <AiChat />
    </div>
  );
}

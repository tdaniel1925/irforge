"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MemberShell from "./MemberShell";
import FreeTierBanner from "./FreeTierBanner";
import FeatureGate from "./FeatureGate";
import UserMenu from "./UserMenu";
import WelcomeModal from "./WelcomeModal";
import BackButton from "./BackButton";
import AiChat from "./AiChat";
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
  const bare = BARE_EXACT.includes(pathname) || BARE_PREFIXES.some((p) => pathname.startsWith(p));

  if (bare) return <>{children}</>;

  // Member (individual investor) back office gets its own shell, not the company
  // dashboard sidebar / tier gating.
  if (pathname.startsWith("/member")) return <MemberShell>{children}</MemberShell>;

  const feature = ROUTE_FEATURE[pathname];

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar: Back to the previous page (left) + account dropdown (right). */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-app bg-app/80 px-8 py-3 backdrop-blur">
          {pathname !== "/app" ? <BackButton fallback="/app" /> : <span />}
          <UserMenu />
        </header>
        <div className="min-w-0 flex-1 p-8">
          <FreeTierBanner />
          {feature ? <FeatureGate feature={feature}>{children}</FeatureGate> : children}
        </div>
      </main>
      <WelcomeModal />
      <AiChat />
    </div>
  );
}

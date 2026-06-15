"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: string; hint?: string };
type NavGroup = { section: string; items: NavItem[] };

// Grouped so a busy exec finds things by what they're trying to DO, not by a
// 20-item flat scroll. Order = most-used first.
const NAV: NavGroup[] = [
  {
    section: "Publish",
    items: [
      { href: "/app", label: "Approvals", icon: "✓", hint: "Posts we want to send — approve or edit them" },
      { href: "/calendar-os", label: "Content Pipeline", icon: "🧩", hint: "Draft → Reg FD check → approve → schedule" },
      { href: "/counsel", label: "Counsel Console", icon: "⚖️", hint: "Sign off on Reg FD–flagged posts" },
      { href: "/voices", label: "Executive Voices", icon: "🎙", hint: "Teach the AI how each leader sounds" },
      { href: "/studio", label: "Writing Studio", icon: "📝", hint: "Draft press releases + disclosure checks" },
    ],
  },
  {
    section: "Investors",
    items: [
      { href: "/stakeholders", label: "Stakeholders", icon: "🤝", hint: "Investors, analysts, press + AI inbound triage" },
      { href: "/crm", label: "Investor CRM", icon: "👥", hint: "Funds, analysts, shareholders + 13F intel" },
      { href: "/investors", label: "Find Investors", icon: "🎯", hint: "Funds that own similar companies" },
      { href: "/company", label: "Defense & Reach", icon: "🛡", hint: "Threats to your name + your visibility score" },
    ],
  },
  {
    section: "Records",
    items: [
      { href: "/calendar", label: "IR Calendar", icon: "📅", hint: "Earnings, deadlines, auto quiet periods" },
      { href: "/captable", label: "Cap Table", icon: "📈", hint: "Ownership, dilution, convertible notes" },
      { href: "/analyzer", label: "Doc Analyzer", icon: "🔬", hint: "AI reads any document, flags risks + disclosure" },
      { href: "/documents", label: "Document Vault", icon: "🗂", hint: "Filings, board docs, policies, decks" },
    ],
  },
  {
    section: "Insights",
    items: [
      { href: "/intelligence", label: "Intelligence", icon: "📊", hint: "Your IR program at a glance + weekly summary" },
      { href: "/proof", label: "Your Results", icon: "📈", hint: "Numbers to show your board" },
    ],
  },
  {
    section: "Your public presence",
    items: [
      { href: "/t", label: "Public Page", icon: "🌐", hint: "What investors see when they look you up" },
      { href: "/embeds", label: "Embeds & Badges", icon: "🔗", hint: "Live widgets for your own website" },
      { href: "/ticker-audit", label: "Look Up a Ticker", icon: "🔎", hint: "Live report on any company" },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/learn", label: "Public Company 101", icon: "📚", hint: "Plain-English IR & filing guides" },
      { href: "/billing", label: "Billing & Plan", icon: "💳", hint: "Your subscription and plan" },
      { href: "/settings", label: "Settings", icon: "⚙", hint: "Company details, connect X" },
    ],
  },
  {
    section: "Operations",
    items: [
      { href: "/admin", label: "Admin", icon: "🛠", hint: "All companies, revenue, claims (admins only)" },
      { href: "/onboarding", label: "New Company Setup", icon: "✦", hint: "The wizard a new company fills out" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-app bg-app p-4">
      <div className="mb-8 flex items-center justify-between px-2">
        <Link href="/app" className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-app">Pubco</span>
          <span className="text-xl font-bold text-emerald-400">Zone</span>
          <span className="text-emerald-400">.</span>
        </Link>
        <ThemeToggle />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-faint">
              {group.section}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.hint}
                    className={`flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-300"
                        : "text-muted hover:bg-app-hover hover:text-app"
                    }`}
                  >
                    <span className="w-4 text-center">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto px-2 pt-6 text-[11px] leading-relaxed text-slate-600">
        AI-powered IR for public companies.
        <br />
        Nothing posts without human approval.
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: string; hint?: string };
type NavGroup = { section: string; items: NavItem[] };

// Grouped by the job to be done, in the order an IR person actually works:
// create & approve content → stay compliant → manage investors → know your
// numbers → show up publicly → resources → settings. Plain-English headers.
const NAV: NavGroup[] = [
  {
    section: "Start here",
    items: [
      { href: "/app", label: "Approvals", icon: "✅", hint: "Posts waiting for your one-tap approval" },
      { href: "/intelligence", label: "Dashboard", icon: "📊", hint: "Your IR program at a glance + weekly summary" },
    ],
  },
  {
    section: "Create & post",
    items: [
      { href: "/calendar-os", label: "Content Pipeline", icon: "🧩", hint: "Draft → Reg FD check → approve → schedule" },
      { href: "/studio", label: "Writing Studio", icon: "📝", hint: "Draft press releases + disclosure checks" },
      { href: "/voices", label: "Executive Voices", icon: "🎙", hint: "Teach the AI how each leader sounds" },
      { href: "/calendar", label: "IR Calendar", icon: "📅", hint: "Earnings, deadlines, auto quiet periods" },
    ],
  },
  {
    section: "Stay compliant",
    items: [
      { href: "/counsel", label: "Counsel Console", icon: "⚖️", hint: "Sign off on Reg FD–flagged posts" },
      { href: "/analyzer", label: "Doc Analyzer", icon: "🔬", hint: "AI reads any document, flags risks + disclosure" },
      { href: "/documents", label: "Document Vault", icon: "🗂", hint: "Filings, board docs, policies, decks" },
    ],
  },
  {
    section: "Investors",
    items: [
      { href: "/crm", label: "CRM", icon: "👥", hint: "Contacts, companies, deals, tasks — your whole pipeline" },
      { href: "/stakeholders", label: "Inbound Triage", icon: "📥", hint: "Paste any inbound message — AI drafts a safe reply" },
      { href: "/investors", label: "Find Investors", icon: "🎯", hint: "Funds that own similar companies" },
      { href: "/captable", label: "Cap Table", icon: "📈", hint: "Ownership, dilution, convertible notes" },
    ],
  },
  {
    section: "Your reputation",
    items: [
      { href: "/company", label: "Defense & Reach", icon: "🛡", hint: "Threats to your name + your visibility score" },
      { href: "/proof", label: "Results & Proof", icon: "📈", hint: "Numbers to show your board" },
    ],
  },
  {
    section: "Get the word out",
    items: [
      { href: "/t", label: "Your Public Page", icon: "🌐", hint: "What investors see when they look you up" },
      { href: "/marketing-kit", label: "Marketing Kit", icon: "📣", hint: "Ready-made posts, graphics & links to share" },
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
    section: "Admin",
    items: [
      { href: "/admin", label: "Back Office", icon: "🛠", hint: "All companies, revenue, claims (admins only)" },
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
      <nav className="flex-1 space-y-4 overflow-y-auto">
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
      <div className="mt-auto px-2 pt-6 text-[11px] leading-relaxed text-faint">
        AI-powered IR for public companies.
        <br />
        Nothing posts without human approval.
      </div>
    </aside>
  );
}

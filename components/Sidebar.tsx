"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; icon: string; hint?: string; detail?: string };
type NavGroup = { section: string; items: NavItem[] };

// Grouped by the job to be done, in the order an IR person actually works:
// create & approve content → stay compliant → manage investors → know your
// numbers → show up publicly → resources → settings. Plain-English headers.
const NAV: NavGroup[] = [
  {
    section: "Start here",
    items: [
      { href: "/app", label: "Approvals", icon: "✅", hint: "Posts waiting for your one-tap approval", detail: "Your inbox of posts the AI has drafted and is ready to publish. Nothing ever goes out without you — review each one, edit if needed, then approve or skip with a single tap. Disclosures attach automatically on post." },
      { href: "/intelligence", label: "Dashboard", icon: "📊", hint: "Your IR program at a glance + weekly summary", detail: "A live snapshot of how your investor-relations program is performing: what shipped, your Reg FD mix, inbound volume, and stakeholder counts. Generate a one-click weekly summary written for your board or execs and emailed to them." },
    ],
  },
  {
    section: "Create & post",
    items: [
      { href: "/calendar-os", label: "Content Pipeline", icon: "🧩", hint: "Draft → Reg FD check → approve → schedule", detail: "Take any post from idea to published on one board. Type a topic and AI drafts it in an executive's voice, run the 1-click Reg FD check (green/yellow/red), route risky posts to counsel, then approve, schedule, and publish to every channel — all in a couple of clicks." },
      { href: "/studio", label: "Writing Studio", icon: "📝", hint: "Draft press releases + disclosure checks", detail: "Draft press releases and longer-form content with AI help, then run a disclosure check that flags whether the content is the kind of thing that's typically disclosed on an 8-K — so you can confirm with counsel before it goes out." },
      { href: "/voices", label: "Executive Voices", icon: "🎙", hint: "Teach the AI how each leader sounds", detail: "Set up each leader once — their tone, example posts, and words to never use. Then every AI-drafted post can sound like them, and a built-in voice-check flags anything off-brand before it publishes." },
      { href: "/calendar", label: "IR Calendar", icon: "📅", hint: "Earnings, deadlines, auto quiet periods", detail: "Keep every IR date in one place: earnings, filing deadlines, investor events. Mark quiet periods and the system automatically blocks sensitive (yellow/red) posts from going out during the window." },
    ],
  },
  {
    section: "Stay compliant",
    items: [
      { href: "/counsel", label: "Counsel Console", icon: "⚖️", hint: "Sign off on Reg FD–flagged posts", detail: "A dedicated queue for counsel: only the posts the AI flagged RED (potential material non-public info) show up here. Counsel reviews, then signs off in one click — capturing a tamper-evident record (hash + IP + device) for your audit trail. Nothing RED publishes without this sign-off." },
      { href: "/analyzer", label: "Doc Analyzer", icon: "🔬", hint: "AI reads any document, flags risks + disclosure", detail: "Upload any document — a contract, agreement, or filing — and AI summarizes it, pulls out the key terms (amounts, dates, parties), flags risks, and tells you whether it likely triggers an 8-K disclosure. Not legal advice; it flags so the right person reviews." },
      { href: "/documents", label: "Document Vault", icon: "🗂", hint: "Filings, board docs, policies, decks", detail: "A secure home for your filings, board documents, policies, and investor decks. Import your SEC filings automatically, and keep everything organized in one place your team can find." },
    ],
  },
  {
    section: "Investors",
    items: [
      { href: "/crm", label: "CRM", icon: "👥", hint: "Contacts, companies, deals, tasks — your whole pipeline", detail: "A full CRM built for IR: track contacts and the firms they work at, move deals through a pipeline, log every call/email/meeting, and manage follow-up tasks. Import your existing contacts from a CSV and export anytime. Dashboard shows pipeline value, win rate, and what's due." },
      { href: "/stakeholders", label: "Inbound Triage", icon: "📥", hint: "Paste any inbound message — AI drafts a safe reply", detail: "Paste any inbound DM, email, or comment and AI tells you who it's likely from, categorizes it, and drafts a Reg FD-safe reply you can send. Keeps your investor/press relationships organized and your responses compliant." },
      { href: "/investors", label: "Find Investors", icon: "🎯", hint: "Funds that own similar companies", detail: "Discover institutional investors who already hold companies like yours (from public 13F data) — a targeted list of funds most likely to be interested in your story, so your outreach starts warm." },
      { href: "/captable", label: "Cap Table", icon: "📈", hint: "Ownership, dilution, convertible notes", detail: "See your ownership fully diluted — common, preferred, insiders, options, warrants — and exactly what your convertible notes turn into at any share price. The fully-diluted number every financing decision hinges on, in one place." },
    ],
  },
  {
    section: "Your reputation",
    items: [
      { href: "/company", label: "Defense & Reach", icon: "🛡", hint: "Threats to your name + your visibility score", detail: "Monitors what's being said about you across the boards and flags threats — pump-and-dump posts, FUD, misinformation — and helps you respond with a calm, filing-cited rebuttal. Also tracks your Visibility Score so you can see your reach improving." },
      { href: "/proof", label: "Results & Proof", icon: "📈", hint: "Numbers to show your board", detail: "The proof your IR budget is working: your Visibility Score over time, every post you published, and a complete, exportable record of who approved what (the part your lawyers want). Screenshot any of it for your board deck." },
    ],
  },
  {
    section: "Get the word out",
    items: [
      { href: "/t", label: "Your Public Page", icon: "🌐", hint: "What investors see when they look you up", detail: "The live, public investor page for your ticker — real SEC filings, financials, insider and short data, an AI bull/bear analysis, a moderated discussion board, and a way for investors to ask you questions on the record. This is what people see when they look you up." },
      { href: "/marketing-kit", label: "Marketing Kit", icon: "📣", hint: "Ready-made posts, graphics & links to share", detail: "Everything you need to tell investors where the real conversation is — free. AI-written announcement posts in your voice, branded share graphics, copy-paste replies for StockTwits/iHub, an investor email template, and your shareable welcome link." },
      { href: "/embeds", label: "Embeds & Badges", icon: "🔗", hint: "Live widgets for your own website", detail: "Drop live PubcoZone data onto your own IR website: a Visibility Grade badge, a live price chip, a 'Verified' trust seal, a stock snapshot card, or your full investor hub. Copy a snippet, paste it on your site — it updates itself." },
      { href: "/ticker-audit", label: "Look Up a Ticker", icon: "🔎", hint: "Live report on any company", detail: "Run a full live report on any public company — yours or a peer's — built from a dozen public sources in about 15 seconds. Great for sizing up competitors or checking how your own page looks to an investor." },
    ],
  },
  {
    section: "Account",
    items: [
      { href: "/learn", label: "Public Company 101", icon: "📚", hint: "Plain-English IR & filing guides", detail: "A plain-English library on being a public company — IR best practices, what each SEC filing means, disclosure rules, and how to engage investors compliantly. No jargon, written for busy operators." },
      { href: "/billing", label: "Billing & Plan", icon: "💳", hint: "Your subscription and plan", detail: "Manage your subscription and plan. Upgrade, see what each tier includes, and open the secure Stripe portal to update payment details or cancel anytime." },
      { href: "/settings", label: "Settings", icon: "⚙", hint: "Company details, connect X", detail: "Your company profile (name, ticker, sector, approver), and where you connect your social accounts for publishing. Set your disclosure and forward-looking-statement language here too." },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin", label: "Back Office", icon: "🛠", hint: "All companies, revenue, claims (admins only)", detail: "Admin-only operations console: every company on the platform, your revenue and subscriptions, the claim-request queue, per-company feature toggles, and the full audit log." },
      { href: "/onboarding", label: "New Company Setup", icon: "✦", hint: "The wizard a new company fills out", detail: "The guided setup wizard a new company fills out — look up their ticker on EDGAR, confirm the profile, and the system pulls their real filings and drafts their first posts automatically." },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [info, setInfo] = useState<NavItem | null>(null);

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
                  <div key={item.href} className="group flex items-center">
                    <Link
                      href={item.href}
                      title={item.hint}
                      className={`flex flex-1 items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${
                        active
                          ? "bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-300"
                          : "text-muted hover:bg-app-hover hover:text-app"
                      }`}
                    >
                      <span className="w-4 text-center">{item.icon}</span>
                      {item.label}
                    </Link>
                    {item.detail && (
                      <button
                        type="button"
                        onClick={() => setInfo(item)}
                        title={`What is ${item.label}?`}
                        aria-label={`What is ${item.label}?`}
                        className="ml-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-faint opacity-0 transition hover:bg-app-hover hover:text-emerald-500 focus:opacity-100 group-hover:opacity-100"
                      >
                        ⓘ
                      </button>
                    )}
                  </div>
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

      {info && <InfoModal item={info} onClose={() => setInfo(null)} />}
    </aside>
  );
}

// Modal explaining a single feature, opened from the ⓘ next to each nav link.
function InfoModal({ item, onClose }: { item: NavItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-app bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{item.icon}</span>
            <h2 className="text-lg font-bold text-app">{item.label}</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md px-2 text-faint transition hover:bg-app-hover hover:text-app">✕</button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{item.detail}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app transition hover:bg-app-hover">Close</button>
          <Link href={item.href} onClick={onClose} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
            Open {item.label} →
          </Link>
        </div>
      </div>
    </div>
  );
}

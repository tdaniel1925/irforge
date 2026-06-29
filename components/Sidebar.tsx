"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { HELP, getArticle } from "@/lib/helpContent";

type NavItem = { href: string; label: string; icon: string; hint?: string; detail?: string; helpKey?: string };
type NavGroup = { section: string; items: NavItem[] };

// Grouped by the job to be done, in the order an IR person actually works:
// create & schedule content → calendars/events → stay compliant → manage
// investors → reputation → show up publicly → learn → admin. Plain-English,
// plain-verb labels (Quick Post / Create a Post / Plan a Month) so it's obvious
// which tool does what. Home IS the approval inbox (no separate Approvals item).
const NAV: NavGroup[] = [
  {
    section: "Start here",
    items: [
      { href: "/app", label: "Home", icon: "🏠", hint: "Your approval inbox — posts waiting for your tap", detail: "Your home base: the inbox of posts the AI has drafted and is ready to publish. Nothing ever goes out without you — review each one, edit if needed, then approve or skip with a single tap. Disclosures attach automatically on post." },
      { href: "/setup", label: "Get started", icon: "🚀", hint: "Your setup checklist — what's done, what's left", detail: "A live checklist that gets your company set up. Admins see the company-wide steps (ticker, profile, approver, social accounts, disclosures, peers, inviting the team); everyone sees their own (approve a first post, set up a workspace, learn the basics). Each item checks itself off automatically from your real data and links to where you complete it." },
      { href: "/intelligence", label: "Analytics", icon: "📊", hint: "Your IR program at a glance + weekly summary", detail: "A live snapshot of how your investor-relations program is performing: what shipped, your Reg FD mix, inbound volume, and stakeholder counts. Generate a one-click weekly summary written for your board or execs and emailed to them." },
    ],
  },
  {
    section: "Create & schedule",
    items: [
      { href: "/compose", label: "Compose", icon: "✍️", hint: "Post now, schedule, plan a month, or a press release — one place", detail: "One place to create anything: publish a post now, schedule it, let AI plan a whole month, or draft a press release. Pick your mode and the rest is handled — every path runs the same compliance and Reg FD checks, and nothing publishes without your approval." },
      { href: "/posts", label: "Posts", icon: "📬", hint: "Approve, schedule & track — one pipeline", detail: "Your whole posting pipeline in one place: what needs your approval, what's scheduled (calendar or list), and what's published with delivery status. Every post is compliance-checked, and nothing goes out without you." },
      { href: "/social/setup", label: "Social Media Setup", icon: "🎨", hint: "Logo, colors, image style, voice & guidance — set once", detail: "Set your brand once and every AI post + image stays on-brand: upload your logo, pick brand colors and an image style (with live samples), teach the AI your executives' voice, and add any guidance that helps. A guided, step-by-step setup. Still fully compliance-checked." },
      { href: "/calendar", label: "IR Calendar", icon: "📅", hint: "Earnings, deadlines, conferences, lock-ups", detail: "Keep every IR date in one place: earnings, filing deadlines, conferences, lock-ups, meetings, and reminders. Set a quiet period whenever you need one to block sensitive posts during a blackout window." },
      { href: "/calendars", label: "Team Calendars", icon: "📆", hint: "IR / Tech / General / personal — admin sets who sees what", detail: "All your team's calendars in one view: IR, Tech & Dev, a General calendar everyone sees, and personal ones. Admins choose which calendars each teammate can see; anyone can add events to a calendar they have access to." },
      { href: "/team", label: "Team", icon: "🧑‍🤝‍🧑", hint: "Invite teammates & manage roles", detail: "Manage who can access this company account: invite teammates by email, set each person as an admin or member, and remove people. Admins can invite and manage roles; members get the full dashboard plus their own private workspace." },
    ],
  },
  {
    section: "Comply & investors",
    items: [
      { href: "/counsel", label: "Counsel Console", icon: "⚖️", hint: "Sign off on Reg FD–flagged posts", detail: "A dedicated queue for counsel: only the posts the AI flagged RED (potential material non-public info) show up here. Counsel reviews, then signs off in one click — capturing a tamper-evident record (hash + IP + device) for your audit trail. Nothing RED publishes without this sign-off." },
      { href: "/analyzer", label: "Doc Analyzer", icon: "🔬", hint: "AI reads any document, flags risks + disclosure", detail: "Upload any document — a contract, agreement, or filing — and AI summarizes it, pulls out the key terms (amounts, dates, parties), flags risks, and tells you whether it likely triggers an 8-K disclosure. Not legal advice; it flags so the right person reviews." },
      { href: "/documents", label: "Document Vault", icon: "🗂", hint: "Filings, board docs, policies, decks", detail: "A secure home for your filings, board documents, policies, and investor decks. Import your SEC filings automatically, and keep everything organized in one place your team can find." },
      { href: "/crm", label: "CRM", icon: "👥", hint: "Contacts, companies, deals, tasks — your whole pipeline", detail: "A full CRM built for IR: track contacts and the firms they work at, move deals through a pipeline, log every call/email/meeting, and manage follow-up tasks. Import your existing contacts from a CSV and export anytime. Dashboard shows pipeline value, win rate, and what's due." },
      { href: "/stakeholders", label: "Investor Inbox", icon: "📥", hint: "Paste any inbound message — AI drafts a reply for your review", detail: "Paste any inbound DM, email, or comment and AI tells you who it's likely from, categorizes it, and drafts a reply — grounded in your public record — that you review and approve before sending. Keeps your investor/press relationships organized and your responses on the record." },
      { href: "/investors", label: "Find Investors", icon: "🎯", hint: "Funds that own similar companies", detail: "Discover institutional investors who already hold companies like yours (from public 13F data) — a targeted list of funds most likely to be interested in your story, so your outreach starts warm." },
      { href: "/captable", label: "Cap Table", icon: "💹", hint: "Ownership, dilution, convertible notes", detail: "See your ownership fully diluted — common, preferred, insiders, options, warrants — and exactly what your convertible notes turn into at any share price. The fully-diluted number every financing decision hinges on, in one place." },
    ],
  },
  {
    section: "Grow & reputation",
    items: [
      { href: "/company", label: "Defend Your Name", icon: "🛡", hint: "Threats to your name + your visibility score", detail: "Monitors what's being said about you across the boards and flags threats — pump-and-dump posts, FUD, misinformation — and helps you respond with a calm, filing-cited rebuttal. Also tracks your Visibility Score so you can see your reach improving." },
      { href: "/proof", label: "Results", icon: "🏆", hint: "Numbers to show your board", detail: "The proof your IR budget is working: your Visibility Score over time, every post you published, and a complete, exportable record of who approved what (the part your lawyers want). Screenshot any of it for your board deck." },
      { href: "/t", label: "Your Public Page", icon: "🌐", hint: "What investors see when they look you up", detail: "The live, public investor page for your ticker — real SEC filings, financials, insider and short data, an AI bull/bear analysis, a moderated discussion board, and a way for investors to ask you questions on the record. This is what people see when they look you up." },
      { href: "/marketing-kit", label: "Marketing Kit", icon: "📣", hint: "Ready-made posts, graphics & links to share", detail: "Everything you need to tell investors where the real conversation is — free. AI-written announcement posts in your voice, branded share graphics, copy-paste replies for StockTwits/iHub, an investor email template, and your shareable welcome link." },
      { href: "/briefs", label: "Research Brief", icon: "📄", hint: "Order a disclosed, AI-written research brief", detail: "Order a Sponsored Research Brief ($3,500 one-time): AI writes a thorough, balanced, filing-based profile of your company — clearly disclosed as company-sponsored — that you can publish to your feed. You pay us to write it, not to rate it; the independent AI panel stays free." },
      { href: "/embeds", label: "Embeds & Badges", icon: "🔗", hint: "Live widgets for your own website", detail: "Drop live PubcoZone data onto your own IR website: a Visibility Grade badge, a live price chip, a 'Verified' trust seal, a stock snapshot card, or your full investor hub. Copy a snippet, paste it on your site — it updates itself." },
      { href: "/ticker-audit", label: "Look Up a Ticker", icon: "🔎", hint: "Live report on any company", detail: "Run a full live report on any public company — yours or a peer's — built from a dozen public sources in about 15 seconds. Great for sizing up competitors or checking how your own page looks to an investor." },
      { href: "/help", label: "Help Center", icon: "❓", hint: "Plain-English guides to every feature", detail: "Short, plain-language help articles for every part of PubcoZone — Approvals, Content Pipeline, CRM, Counsel, and more — plus the setup walkthrough. The same articles you reach from the ⓘ next to each menu item." },
      { href: "/learn", label: "Public Company 101", icon: "📚", hint: "Plain-English IR & filing guides", detail: "A plain-English library on being a public company — IR best practices, what each SEC filing means, disclosure rules, and how to engage investors compliantly. No jargon, written for busy operators." },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin", label: "Back Office", icon: "🛠", hint: "All companies, revenue, claims (admins only)", detail: "Admin-only operations console: every company on the platform, your revenue and subscriptions, the claim-request queue, per-company feature toggles, and the full audit log." },
      { href: "/admin/leads", label: "Lead Finder", icon: "🧲", hint: "Build outreach lists from SEC EDGAR (admins only)", detail: "Build prospecting lists from live SEC EDGAR filings (company, ticker, phone, address, recent filing), add verified IR emails, export to CSV, and send capped, approved cold outreach tracked back to delivery status." },
    ],
  },
];

const COLLAPSE_KEY = "pz-sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const [info, setInfo] = useState<NavItem | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [superAdmin, setSuperAdmin] = useState(false);
  const [ticker, setTicker] = useState("");

  // Restore collapsed-section state, OR — on first visit (no saved state) — collapse
  // every section by default EXCEPT the one containing the current page, so the nav
  // starts compact (headers only) instead of a long wall of items.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) { setCollapsed(JSON.parse(raw)); return; }
    } catch { /* ignore */ }
    const activeSection = NAV.find((g) => g.items.some((i) => i.href === pathname))?.section;
    const init: Record<string, boolean> = {};
    for (const g of NAV) init[g.section] = g.section !== activeSection; // true = collapsed
    setCollapsed(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Who's signed in: drives admin-only nav + "Your Public Page" -> their real page.
  // no-store so the admin-nav flag is NEVER served stale from a cached response
  // (a cached superAdmin=true from another session would wrongly show Admin links).
  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setSuperAdmin(Boolean(d?.superAdmin));
        setTicker(String(d?.company?.ticker ?? "").trim());
      })
      .catch(() => {});
  }, []);

  // Hide the Admin section unless the user is a platform super-admin; point
  // "Your Public Page" at the company's real ticker page when we know it.
  const nav: NavGroup[] = NAV
    .filter((g) => g.section !== "Admin" || superAdmin)
    .map((g) => ({
      ...g,
      items: g.items.map((it) =>
        it.href === "/t" && it.label === "Your Public Page" && ticker
          ? { ...it, href: `/t/${ticker}` }
          : it
      ),
    }));

  const toggle = (section: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // The whole aside is fixed full-height; only the nav list scrolls, so links out
  // of view are reachable without scrolling the page content.
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-app bg-app">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/app" className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-app">Pubco</span>
          <span className="text-xl font-bold text-emerald-400">Zone</span>
          <span className="text-emerald-400">.</span>
        </Link>
        <ThemeToggle />
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {nav.map((group) => {
          const isCollapsed = collapsed[group.section];
          // A section containing the current page stays open even if collapsed in storage,
          // so the active link is never hidden.
          const hasActive = group.items.some((i) => i.href === pathname);
          const open = !isCollapsed || hasActive;
          return (
            <div key={group.section}>
              <button
                type="button"
                onClick={() => toggle(group.section)}
                className="flex w-full items-center justify-between rounded px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint transition hover:text-app"
                aria-expanded={open}
              >
                <span>{group.section}</span>
                <span className={`transition-transform ${open ? "" : "-rotate-90"}`}>⌄</span>
              </button>
              {open && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <div key={item.href} className="group flex items-center">
                        <Link
                          href={item.href}
                          title={item.hint}
                          className={`flex flex-1 items-center gap-2.5 rounded-lg px-3 py-1 text-sm transition ${
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
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-app px-4 py-3 text-[11px] leading-relaxed text-faint">
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
        {(() => {
          // Find a matching help article by explicit key or by the feature's href.
          const article = item.helpKey ? getArticle(item.helpKey) : HELP.find((a) => a.href === item.href);
          return article ? (
            <Link href={`/help/${article.slug}`} onClick={onClose} className="mt-3 inline-block text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              📖 Learn more about {item.label} →
            </Link>
          ) : null;
        })()}
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

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
// Leaner IA: ~12 primary items in 4 sections (WORK / COMPLY / INVESTORS / REPUTATION)
// + Admin. Configure-once, one-time-purchase, and education items live in the Account
// menu (UserMenu) instead of the daily sidebar. Merges: Team Calendars folds into
// Calendar (tabs); Visibility Score is owned by Reputation (Results just references it).
const NAV: NavGroup[] = [
  {
    section: "Work",
    items: [
      { href: "/app", label: "Home", icon: "🏠", hint: "Your approval inbox — posts waiting for your tap", detail: "Your home base: the inbox of posts the AI has drafted and is ready to publish. Nothing ever goes out without you — review each one, edit if needed, then approve or skip with a single tap. Disclosures attach automatically on post." },
      { href: "/compose", label: "Compose", icon: "✍️", hint: "Create a post — publish now, schedule, plan a month, or a press release", detail: "Where you CREATE content: publish a post now, schedule it, let AI plan a whole month, or draft a press release. Every path runs the same compliance and Reg FD checks. Once created, track and approve it in Posts." },
      { href: "/posts", label: "Posts", icon: "📬", hint: "Manage & track — approvals, schedule, published", detail: "Where you MANAGE content after creating it: what needs approval, what's scheduled (calendar or list), and what's published with delivery status. Every post is compliance-checked, and nothing goes out without you." },
      { href: "/stakeholders", label: "Investor Inbox", icon: "📥", hint: "Paste any inbound message — AI drafts a reply for your review", detail: "Paste any inbound DM, email, or comment and AI tells you who it's likely from, categorizes it, and drafts a reply — grounded in your public record — that you review and approve before sending. Keeps your investor/press relationships organized and your responses on the record." },
      { href: "/calendar", label: "Calendar", icon: "📅", hint: "IR dates, team & personal calendars, quiet periods", detail: "Every date in one place — earnings, filing deadlines, conferences, lock-ups, plus team and personal calendars. Set a quiet period to block sensitive posts during a blackout window." },
      { href: "/intelligence", label: "Analytics", icon: "📊", hint: "Your IR program at a glance + weekly summary", detail: "A live snapshot of how your investor-relations program is performing: what shipped, your Reg FD mix, inbound volume, and stakeholder counts. Generate a one-click weekly summary written for your board or execs and emailed to them." },
    ],
  },
  {
    section: "Comply",
    items: [
      { href: "/counsel", label: "Legal Review", icon: "⚖️", hint: "Sign off on Reg FD–flagged posts", detail: "A dedicated queue for legal sign-off: only the posts the AI flagged RED (potential material non-public info) show up here. Review, then sign off in one click — capturing a tamper-evident record (hash + IP + device) for your audit trail. Nothing RED publishes without this sign-off." },
      { href: "/analyzer", label: "Doc Analyzer", icon: "🔬", hint: "AI reads any document, flags risks + disclosure", detail: "Upload any document — a contract, agreement, or filing — and AI summarizes it, pulls out the key terms (amounts, dates, parties), flags risks, and tells you whether it likely triggers an 8-K disclosure. Not legal advice; it flags so the right person reviews." },
      { href: "/documents", label: "Document Vault", icon: "🗂", hint: "Filings, board docs, policies, decks", detail: "A secure home for your filings, board documents, policies, and investor decks. Import your SEC filings automatically, and keep everything organized in one place your team can find." },
    ],
  },
  {
    section: "Investors",
    items: [
      { href: "/crm", label: "CRM", icon: "👥", hint: "Contacts, companies, deals, tasks — plus find new investors", detail: "A full CRM built for IR: track contacts and firms, move deals through a pipeline, log every touch, and manage tasks. Includes Find Investors — funds that already hold companies like yours (from public 13F data). Import from CSV and export anytime." },
      { href: "/captable", label: "Cap Table", icon: "💹", hint: "Ownership, dilution, convertible notes", detail: "See your ownership fully diluted — common, preferred, insiders, options, warrants — and exactly what your convertible notes turn into at any share price. The fully-diluted number every financing decision hinges on, in one place." },
    ],
  },
  {
    section: "Reputation",
    items: [
      { href: "/company", label: "Reputation", icon: "🛡", hint: "Threats to your name + your visibility score", detail: "Monitors what's being said about you across the boards and flags threats — pump-and-dump posts, FUD, misinformation — and helps you respond with a calm, filing-cited rebuttal. This is the home of your Visibility Score, tracking your reach over time." },
      { href: "/t", label: "Public Page", icon: "🌐", hint: "What investors see when they look you up (+ look up any ticker)", detail: "The live, public investor page for your ticker — real SEC filings, financials, insider and short data, an AI bull/bear analysis, a moderated discussion board, and a way for investors to ask you questions. Look up any other ticker from here too." },
      { href: "/proof", label: "Results", icon: "🏆", hint: "Board-ready record — published posts + approval trail", detail: "The proof your IR budget is working: every post you published and a complete, exportable record of who approved what (the part your lawyers want). Your Visibility Score over time lives on the Reputation page. Screenshot any of it for your board deck." },
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
  const [openQuestions, setOpenQuestions] = useState(0); // unanswered investor board questions

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
    let cancelled = false;
    // Retry a couple of times: a single transient failure must NOT permanently hide
    // the Admin section for a super-admin (it's their only nav path to Back Office).
    const loadState = async (attempt = 0): Promise<void> => {
      try {
        const r = await fetch("/api/state", { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        if (cancelled) return;
        setSuperAdmin(Boolean(d?.superAdmin));
        setTicker(String(d?.company?.ticker ?? "").trim());
        setOpenQuestions(Number(d?.openQuestions ?? 0));
      } catch {
        if (cancelled || attempt >= 2) return;
        setTimeout(() => { void loadState(attempt + 1); }, 800 * (attempt + 1));
      }
    };
    void loadState();
    return () => { cancelled = true; };
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
                          <span className="flex-1">{item.label}</span>
                          {item.href === "/company" && openQuestions > 0 && (
                            <span title={`${openQuestions} unanswered investor question${openQuestions === 1 ? "" : "s"}`} className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-bold text-white">
                              {openQuestions > 99 ? "99+" : openQuestions}
                            </span>
                          )}
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

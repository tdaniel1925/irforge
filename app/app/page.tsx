import Link from "next/link";
import { redirect } from "next/navigation";
import { getMyCompany } from "@/lib/supabase/store";
import { listTeamProfiles, listTeamUpdates, todaysBirthdays, dailyQuote } from "@/lib/dashboard";
import { listMyCalendars, listCalendarEvents } from "@/lib/calendars";
import { getQuotes } from "@/lib/quotes";
import { listPosts, getMetrics } from "@/lib/iros";
import { getMorningRead } from "@/lib/morningRead";
import HomeDashboard from "@/components/HomeDashboard";

export const dynamic = "force-dynamic";

// HOME = the daily-update dashboard (replaces the old approvals inbox, which now
// lives at /approvals). Welcoming start-of-day screen per the Dru call.
export default async function Home() {
  const mine = await getMyCompany();
  if (!mine) redirect("/login");

  // Not onboarded yet → finish setup instead of an empty dashboard.
  if (!mine.company.ticker?.trim()) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold text-app">Let&apos;s finish setting up</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Your account is ready — connect your ticker and we&apos;ll pull your public profile and draft your first posts. Takes about a minute.
        </p>
        <Link href="/onboarding" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Finish setup →
        </Link>
      </div>
    );
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);

  // Fetch the dashboard data server-side (parallel).
  const [profiles, updates, birthdays, calendars, events] = await Promise.all([
    listTeamProfiles(),
    listTeamUpdates(),
    todaysBirthdays(),
    listMyCalendars(),
    listCalendarEvents({ from: monthStart, to: monthEnd }),
  ]);

  // Posts awaiting approval (the hero card) + Intelligence stats (folded in).
  let approvals: { id: string; platform: string; theme: string; body: string; classification: string | null }[] = [];
  let metrics: Awaited<ReturnType<typeof getMetrics>> | null = null;
  try {
    const posts = await listPosts();
    approvals = posts
      .filter((p) => p.body && (p.status === "draft" || p.status === "reviewed"))
      .slice(0, 6)
      .map((p) => ({ id: p.id, platform: p.platform, theme: p.theme, body: p.body, classification: p.classification }));
  } catch { /* card degrades */ }
  try { metrics = await getMetrics(); } catch { /* stats degrade */ }

  // Company ticker + peers for the stock widget.
  const tickers = [mine.company.ticker, ...(mine.company.peers ?? [])].filter(Boolean).slice(0, 4);
  let quotes: Record<string, { price: number; changePct: number }> = {};
  try {
    const q = await getQuotes(tickers);
    quotes = Object.fromEntries(Object.entries(q).map(([t, v]) => [t, { price: (v as { price?: number }).price ?? 0, changePct: (v as { changePct?: number }).changePct ?? 0 }]));
  } catch { /* widget degrades gracefully */ }

  // Morning read (recent news) — best-effort.
  let morningRead: Awaited<ReturnType<typeof getMorningRead>> = [];
  try { morningRead = await getMorningRead(mine.company.ticker, mine.company.name); } catch { /* degrades */ }

  return (
    <HomeDashboard
      companyName={mine.company.name}
      ticker={mine.company.ticker}
      quote={dailyQuote()}
      birthdays={birthdays}
      initialProfiles={profiles}
      initialUpdates={updates}
      calendars={calendars}
      events={events}
      quotes={quotes}
      approvals={approvals}
      metrics={metrics}
      morningRead={morningRead}
    />
  );
}

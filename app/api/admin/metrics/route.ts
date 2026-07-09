import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET — platform-wide engagement metrics for the super-admin back office.
// Counts only + small top-N lists; no PII beyond what admins already see elsewhere.
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const svc = createServiceClient();

  const count = async (table: string): Promise<number | null> => {
    const { count: c, error } = await svc.from(table).select("*", { count: "exact", head: true });
    return error ? null : (c ?? 0);
  };

  const [members, watches, boardPosts, reactions, leads, companies] = await Promise.all([
    count("members"), count("watches"), count("public_board"), count("board_reactions"), count("leads"), count("companies"),
  ]);

  // Ticker page views — total + top tickers.
  const { data: viewRows } = await svc.from("ticker_views").select("ticker, views").order("views", { ascending: false });
  const totalViews = (viewRows ?? []).reduce((s, r) => s + Number(r.views || 0), 0);
  const topTickers = (viewRows ?? []).slice(0, 10).map((r) => ({ ticker: String(r.ticker), views: Number(r.views || 0) }));

  // Trending — last 7 days from the daily buckets (empty until the migration runs).
  let trending: { ticker: string; views: number }[] = [];
  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const { data: daily } = await svc.from("ticker_views_daily").select("ticker, views").gte("day", since);
    const byTicker = new Map<string, number>();
    for (const r of daily ?? []) byTicker.set(String(r.ticker), (byTicker.get(String(r.ticker)) ?? 0) + Number(r.views || 0));
    trending = Array.from(byTicker, ([ticker, views]) => ({ ticker, views })).sort((a, b) => b.views - a.views).slice(0, 10);
  } catch { /* table not migrated yet */ }

  // Email deliverability — aggregated Postmark webhook events.
  let email: Record<string, number> = {};
  try {
    const { data: ev } = await svc.from("email_events").select("status");
    for (const r of ev ?? []) {
      const s = String(r.status ?? "unknown");
      email[s] = (email[s] ?? 0) + 1;
    }
  } catch { /* table optional */ }

  // Board character: questions vs answered.
  const { data: board } = await svc.from("public_board").select("flag, verified, parent_id");
  const questions = (board ?? []).filter((p) => p.flag === "question" && !p.parent_id).length;
  const answered = new Set((board ?? []).filter((p) => p.verified && p.parent_id).map((p) => p.parent_id)).size;

  // Newest investor signups — with email (admins already see emails in claims/customers).
  // Email lives in Supabase auth, not the members table, so join via user_id.
  const { data: recentMembers } = await svc
    .from("members")
    .select("user_id, handle, display_name, profile_complete, created_at")
    .order("created_at", { ascending: false })
    .limit(10);
  const emailById = new Map<string, string>();
  try {
    const { data: users } = await svc.auth.admin.listUsers({ perPage: 500 });
    for (const u of users?.users ?? []) emailById.set(u.id, u.email ?? "");
  } catch { /* emails become blank, counts still render */ }

  return NextResponse.json({
    counts: {
      investors: members,
      companies,
      watchlistAdds: watches,
      tickerViews: totalViews,
      tickersViewed: viewRows?.length ?? 0,
      boardPosts,
      questions,
      questionsAnswered: answered,
      reactions,
      leads,
    },
    topTickers,
    trending,
    email,
    recentMembers: (recentMembers ?? []).map((m) => ({
      handle: String(m.handle ?? ""),
      displayName: String(m.display_name ?? ""),
      email: emailById.get(String(m.user_id)) ?? "",
      profileComplete: Boolean(m.profile_complete),
      joined: String(m.created_at ?? "").slice(0, 10),
    })),
  });
}

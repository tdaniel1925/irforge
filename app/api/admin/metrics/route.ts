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

  // Board character: questions vs answered.
  const { data: board } = await svc.from("public_board").select("flag, verified, parent_id");
  const questions = (board ?? []).filter((p) => p.flag === "question" && !p.parent_id).length;
  const answered = new Set((board ?? []).filter((p) => p.verified && p.parent_id).map((p) => p.parent_id)).size;

  // Newest investor signups (handle + joined date; email stays out of this view).
  const { data: recentMembers } = await svc
    .from("members")
    .select("handle, display_name, profile_complete, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

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
    recentMembers: (recentMembers ?? []).map((m) => ({
      handle: String(m.handle ?? ""),
      displayName: String(m.display_name ?? ""),
      profileComplete: Boolean(m.profile_complete),
      joined: String(m.created_at ?? "").slice(0, 10),
    })),
  });
}

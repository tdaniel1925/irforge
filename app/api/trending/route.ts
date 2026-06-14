import { getMarketTrending } from "@/lib/trending";
import { getQuotes } from "@/lib/quotes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Cross-market trending tickers, blended + enriched with live quotes.
export async function GET() {
  try {
    const { tickers, activeSources } = await getMarketTrending(20);
    const quotes = await getQuotes(tickers.map((t) => t.ticker));
    const rows = tickers.map((t) => {
      const q = quotes[t.ticker];
      return {
        ticker: t.ticker,
        sources: t.sources,
        mentions: t.mentions ?? null,
        price: q?.price ?? null,
        changePct: q?.changePct ?? null,
        volume: q?.volume ?? null,
        currency: q?.currency ?? "USD",
      };
    });
    return Response.json(
      { ok: true, activeSources, rows },
      { headers: { "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=3600" } }
    );
  } catch (e) {
    console.error("[trending] failed:", e);
    return Response.json({ ok: false, activeSources: [], rows: [] }, { status: 200 });
  }
}

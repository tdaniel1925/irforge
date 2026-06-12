import { NextResponse } from "next/server";
import { runTickerAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// Step 1 of onboarding — look up a ticker and pre-fill what we can from public data.
export async function GET(req: Request) {
  const ticker = new URL(req.url).searchParams.get("ticker")?.trim().toUpperCase() ?? "";
  if (!/^[A-Za-z.\-]{1,8}$/.test(ticker)) {
    return NextResponse.json({ error: "Enter a valid ticker (1–8 letters)." }, { status: 422 });
  }
  try {
    const audit = await runTickerAudit(ticker, []);
    return NextResponse.json({
      ok: true,
      found: Boolean(audit.companyName),
      ticker: audit.ticker,
      companyName: audit.companyName ?? "",
      cik: audit.cik ?? "",
      exchange: audit.profile?.exchange ?? "",
      sector: audit.profile?.industry ?? "",
      description: audit.companyName ? `${audit.companyName} is advancing its business; see SEC filings for full detail.` : "",
      peers: [],
      score: audit.score,
      grade: audit.grade,
      watchers: audit.social.watchers ?? 0,
      filings12mo: audit.filings.last12mo,
    });
  } catch {
    return NextResponse.json({ ok: true, found: false, ticker, error: "Couldn't reach public sources — you can still enter details manually." });
  }
}

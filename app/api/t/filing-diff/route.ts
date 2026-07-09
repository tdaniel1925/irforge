import { NextResponse } from "next/server";
import { computeFilingDiff } from "@/lib/filingDiff";
import { rateAllow } from "@/lib/publicStats";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "anon").trim();
}

// GET /api/t/filing-diff?ticker=XXX — on-demand "what changed vs the prior period"
// from SEC XBRL facts. Public + reader-triggered (like the truth-check), so it's
// rate-limited rather than auth-gated.
export async function GET(req: Request) {
  const ip = clientIp(req);
  if (!(await rateAllow(`fdiff:${ip}`, 12))) {
    return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
  }

  const u = new URL(req.url);
  const ticker = (u.searchParams.get("ticker") ?? "").toUpperCase().slice(0, 8);
  if (!/^[A-Z][A-Z0-9.\-]{0,7}$/.test(ticker)) {
    return NextResponse.json({ error: "Invalid ticker." }, { status: 422 });
  }

  try {
    const diff = await computeFilingDiff(ticker);
    if (!diff) return NextResponse.json({ error: "Ticker not found on SEC EDGAR." }, { status: 404 });
    return NextResponse.json({ ok: true, diff });
  } catch {
    return NextResponse.json({ error: "Couldn't reach SEC data right now — try again shortly." }, { status: 502 });
  }
}

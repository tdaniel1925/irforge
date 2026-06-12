import { NextResponse } from "next/server";
import { runTickerAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get("ticker")?.trim();
  const peers = (url.searchParams.get("peers") ?? "").split(",").map((p) => p.trim()).filter(Boolean);

  if (!ticker || !/^[A-Za-z.\-]{1,8}$/.test(ticker)) {
    return NextResponse.json({ error: "Enter a valid ticker symbol (1–8 letters)." }, { status: 422 });
  }

  try {
    const audit = await runTickerAudit(ticker, peers);
    return NextResponse.json(audit);
  } catch {
    return NextResponse.json({ error: "Audit failed — all data sources unreachable. Check your internet connection." }, { status: 502 });
  }
}

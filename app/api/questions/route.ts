import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST — an investor asks a question from a public ticker page.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const author = String(body.author ?? "").trim().slice(0, 60) || "Anonymous investor";
  const question = String(body.question ?? "").trim().slice(0, 500);

  if (!ticker || question.length < 10) {
    return NextResponse.json({ error: "Write a question of at least 10 characters." }, { status: 422 });
  }

  const { db, save } = await getStore();
  const q = {
    id: newId("puq"),
    ticker,
    author,
    question,
    ts: new Date().toISOString(),
    status: "open" as const,
  };
  db.publicQuestions.unshift(q);

  const isClaimed = ticker === db.company.ticker.toUpperCase();
  logAudit(
    db,
    "public-site",
    "QUESTION_ASKED",
    `$${ticker} question from ${author}${isClaimed ? " — routed to Do queue" : " — page unclaimed, held for the company"}`
  );
  await save();

  return NextResponse.json({ ok: true, claimed: isClaimed });
}

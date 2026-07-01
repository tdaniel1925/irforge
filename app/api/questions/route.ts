import { NextResponse } from "next/server";
import { addBoardPost, rateAllow } from "@/lib/publicStats";
import { notifyNewQuestion } from "@/lib/boardNotify";

export const dynamic = "force-dynamic";

// POST — an investor asks a question from a public ticker page. Persisted to the
// Supabase public_board (flag='question') so it survives on the serverless host
// and appears on the ticker's board; the company answers as a verified reply.
export async function POST(req: Request) {
  // This is an unauthenticated write that also emails the company — rate-limit it
  // per IP or it's a board-spam + inbox-bombing vector.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!(await rateAllow(`question:${ip}`, 3))) {
    return NextResponse.json({ error: "Slow down a moment — try again shortly." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const author = String(body.author ?? "").trim().slice(0, 60) || "Anonymous investor";
  const question = String(body.question ?? "").trim().slice(0, 500);

  if (!ticker || question.length < 10) {
    return NextResponse.json({ error: "Write a question of at least 10 characters." }, { status: 422 });
  }

  try {
    await addBoardPost({
      ticker,
      author,
      body: question,
      verified: false,
      flag: "question",
      flagReason: "Investor question for the company.",
      ts: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't post your question — try again." }, { status: 500 });
  }

  // Notify the company immediately (best-effort, non-blocking — never delay or fail
  // the investor's post on a notification hiccup).
  void notifyNewQuestion(ticker, author, question);

  return NextResponse.json({ ok: true });
}

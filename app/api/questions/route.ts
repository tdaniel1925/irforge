import { NextResponse } from "next/server";
import { addBoardPost } from "@/lib/publicStats";

export const dynamic = "force-dynamic";

// POST — an investor asks a question from a public ticker page. Persisted to the
// Supabase public_board (flag='question') so it survives on the serverless host
// and appears on the ticker's board; the company answers as a verified reply.
export async function POST(req: Request) {
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

  return NextResponse.json({ ok: true });
}

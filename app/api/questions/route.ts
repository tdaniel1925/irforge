import { NextResponse } from "next/server";
import { addBoardPost, rateAllow } from "@/lib/publicStats";
import { notifyNewQuestion } from "@/lib/boardNotify";
import { getMyMember } from "@/lib/members";

export const dynamic = "force-dynamic";

// POST — an investor asks a question from a public ticker page. Persisted to the
// Supabase public_board (flag='question'); the company answers as a verified reply.
// Requires a signed-in investor with a chosen username — the author is taken from
// their profile (client can't supply a name), so questions are never "Anonymous".
export async function POST(req: Request) {
  const me = await getMyMember();
  if (!me) {
    return NextResponse.json({ error: "Sign in as an investor to ask a question.", needsAuth: true }, { status: 401 });
  }
  if (!me.member.profileComplete) {
    return NextResponse.json({ error: "Set your investor username before you can post.", needsProfile: true }, { status: 403 });
  }

  // Rate limit per member (authenticated now — no anonymous spam vector).
  if (!(await rateAllow(`question:${me.id}`, 3))) {
    return NextResponse.json({ error: "Slow down a moment — try again shortly." }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const author = me.member.handle;
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
      memberId: me.id,
      authorAvatar: me.member.avatarUrl,
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

import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listOpenQuestions, postVerifiedReply } from "@/lib/board";
import { checkContent, hasBlockingFlags } from "@/lib/compliance";
import { writeAudit } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Company-facing board Q&A. GET: open (unanswered) investor questions on the
// company's own board. POST: publish a VERIFIED company reply to a question.
// Auth: scoped to the caller's company (getMyCompany) — a company only ever sees
// and answers its OWN board.

export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const questions = await listOpenQuestions(mine.company.ticker);
  return NextResponse.json({ questions, count: questions.length });
}

// POST { questionId, body } — post the company's verified reply to a question.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { questionId, body } = (await req.json().catch(() => ({}))) as { questionId?: string; body?: string };
  const text = String(body ?? "").trim();
  if (!questionId) return NextResponse.json({ error: "Missing question." }, { status: 422 });
  if (text.length < 2) return NextResponse.json({ error: "Write a reply first." }, { status: 422 });

  // Same compliance gate as every other outbound message — a public reply must not
  // contain blocked language.
  if (hasBlockingFlags(checkContent([text]))) {
    return NextResponse.json({ error: "That reply tripped a compliance flag — edit it and try again." }, { status: 409 });
  }

  const reply = await postVerifiedReply({
    ticker: mine.company.ticker,
    parentId: String(questionId),
    body: text,
    company: mine.company,
  });

  await writeAudit({
    companyId: mine.id,
    action: "board.verified_reply",
    entityType: "board_post",
    entityId: String(questionId),
    payload: { replyId: reply.id },
  });

  return NextResponse.json({ ok: true, reply });
}

import { NextResponse } from "next/server";
import { getDb, logAudit, newId, saveDb } from "@/lib/db";
import { generatePublicAnswer } from "@/lib/ai";
import { checkContent } from "@/lib/compliance";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — draft a compliance-checked answer to a public question (lands in the Do queue as a pending draft).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const q = db.publicQuestions.find((x) => x.id === params.id);
  if (!q) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  if (q.answerDraftId) return NextResponse.json({ error: "Answer already drafted" }, { status: 409 });

  const publicContext = db.filings
    .slice(0, 4)
    .map((f) => `${f.form} (${f.filedAt.slice(0, 10)}): ${f.summary}`)
    .join(" | ");

  const { tweets, engine, deflected } = await generatePublicAnswer(q.question, q.author, db.company, publicContext);

  const draft: Draft = {
    id: newId("drf"),
    kind: "public_answer",
    questionId: q.id,
    title: `Answer ${q.author}: ${q.question.slice(0, 60)}…`,
    tweets,
    status: "pending",
    complianceFlags: checkContent(tweets),
    createdAt: new Date().toISOString(),
    aiEngine: engine,
  };
  db.drafts.unshift(draft);
  q.answerDraftId = draft.id;

  logAudit(
    db,
    "system",
    deflected ? "ANSWER_DEFLECTED" : "DRAFT_CREATED",
    deflected
      ? `${q.id} asks for non-public info — safe deflection drafted (Reg FD guard)`
      : `Public answer drafted for ${q.id} from the public record via ${engine}`
  );
  saveDb(db);
  return NextResponse.json(draft);
}

import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listOpenQuestions } from "@/lib/board";
import { generatePublicAnswer } from "@/lib/ai";
import { checkContent } from "@/lib/compliance";
import { companyHasTierFeature } from "@/lib/platform";

export const dynamic = "force-dynamic";

// POST { questionId } — AI-draft a compliance-checked answer to a live board question.
// Returns the draft text + flags for the company to review/edit in the Q&A inbox
// BEFORE it's posted (draft -> approve -> post happens in the inbox, not here). The
// answer is grounded ONLY in the public record and refuses to volunteer non-public
// info (Reg FD guard lives in generatePublicAnswer).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // AI drafting burns model tokens — tier-gated server-side (UI gating alone is bypassable).
  if (!(await companyHasTierFeature(mine.id, mine.company.tier, "qa"))) {
    return NextResponse.json({ error: "AI answer drafting is part of the Board plan.", needsUpgrade: true, needsFeature: "qa" }, { status: 403 });
  }

  const { questionId } = (await req.json().catch(() => ({}))) as { questionId?: string };
  if (!questionId) return NextResponse.json({ error: "Missing question." }, { status: 422 });

  // Find the question on the company's own board (don't trust a client-supplied body).
  const open = await listOpenQuestions(mine.company.ticker);
  const q = open.find((x) => x.id === String(questionId));
  if (!q) return NextResponse.json({ error: "Question not found or already answered." }, { status: 404 });

  const { tweets, deflected } = await generatePublicAnswer(q.body, q.author, mine.company, "");
  const text = (tweets ?? []).join("\n\n").trim();
  if (!text) return NextResponse.json({ error: "Couldn't draft an answer — try again or write one yourself." }, { status: 502 });

  return NextResponse.json({ draft: text, flags: checkContent([text]), deflected });
}

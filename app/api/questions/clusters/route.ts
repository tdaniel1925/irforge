import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listOpenQuestions } from "@/lib/board";
import { clusterQuestions, type QuestionInput } from "@/lib/questionClusters";

export const dynamic = "force-dynamic";

// GET — surface the top recurring THEMES across the company's open investor
// questions (live public_board data, scoped to the caller's own company). Lets the
// company see what shareholders keep asking and pick what to answer on the record.
//
// COMPLIANCE: this surfaces investor demand only. It returns no answers/advice and
// does not decide anything is material. Answering a cluster still goes through the
// existing draft pipeline (compliance gates + Reg FD guard).
export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ticker = mine.company.ticker.toUpperCase();
  const open: QuestionInput[] = (await listOpenQuestions(ticker)).map((q) => ({
    id: q.id,
    question: q.body,
    author: q.author,
    ts: q.ts,
  }));

  // Below 3 open questions there's nothing meaningful to cluster (and no reason to
  // spend an AI call).
  if (open.length < 3) {
    return NextResponse.json({ ticker, totalOpen: open.length, engine: "template", clusters: [] });
  }

  const { clusters, engine } = await clusterQuestions(open, mine.company.name || ticker);
  return NextResponse.json({ ticker, totalOpen: open.length, engine, clusters });
}

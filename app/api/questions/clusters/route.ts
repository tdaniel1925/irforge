import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { clusterQuestions, type QuestionInput } from "@/lib/questionClusters";

export const dynamic = "force-dynamic";

// GET — surface the top recurring THEMES across a company's open investor questions.
// Read-only: clusters open publicQuestions so the company can see what's asked most and
// pick what to answer on the record. No save(), so this never collides with the POST
// create (../route.ts) or POST draft (../[id]/draft/route.ts) flows.
//
// COMPLIANCE: this surfaces investor demand only. It returns no answers/advice and does
// not decide anything is material. Answering a cluster still goes through the existing
// draft pipeline (generatePublicAnswer + Reg FD guard + checkContent).
export async function GET(req: Request) {
  const { db, authed } = await getStore();
  // AI-cost guard: when auth is enforced, anonymous callers must not reach the
  // model call below (token burn). Demo mode (AUTH_ENABLED off) still works.
  if (process.env.AUTH_ENABLED === "1" && !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Default to the claimed company's ticker; allow ?ticker= override for unclaimed pages.
  const url = new URL(req.url);
  const tickerParam = url.searchParams.get("ticker");
  const ticker = (tickerParam ?? db.company.ticker).toUpperCase();

  const open: QuestionInput[] = db.publicQuestions
    .filter((q) => q.status === "open" && q.ticker.toUpperCase() === ticker)
    .map((q) => ({ id: q.id, question: q.question, author: q.author, ts: q.ts }));

  const { clusters, engine } = await clusterQuestions(open, db.company.name);

  return NextResponse.json({
    ticker,
    totalOpen: open.length,
    engine,
    clusters,
  });
}

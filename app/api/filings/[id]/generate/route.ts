import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { generateFilingThread } from "@/lib/ai";
import { checkContent, hasBlockingFlags } from "@/lib/compliance";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const { db, save } = await getStore();
  const filing = db.filings.find((f) => f.id === params.id);
  if (!filing) return NextResponse.json({ error: "Filing not found" }, { status: 404 });
  if (filing.draftId) return NextResponse.json({ error: "Draft already exists for this filing" }, { status: 409 });

  const { tweets, engine } = await generateFilingThread(filing, db.company);
  const flags = checkContent(tweets);
  const blocked = hasBlockingFlags(flags);

  const draft: Draft = {
    id: newId("drf"),
    kind: "filing_thread",
    filingId: filing.id,
    title: `Thread: ${filing.form} — ${filing.title.slice(0, 60)}`,
    tweets,
    status: blocked ? "blocked" : "pending",
    complianceFlags: flags,
    createdAt: new Date().toISOString(),
    aiEngine: engine,
  };
  db.drafts.unshift(draft);
  filing.draftId = draft.id;

  logAudit(db, "system", "DRAFT_CREATED", `Generated thread from ${filing.form} (${filing.id}) via ${engine}`);
  if (blocked) {
    logAudit(db, "compliance-engine", "DRAFT_BLOCKED", `${draft.id} blocked: ${flags.filter((f) => f.severity === "block").map((f) => `${f.rule} ('${f.excerpt}')`).join(", ")}`);
  }
  await save();
  return NextResponse.json(draft);
}

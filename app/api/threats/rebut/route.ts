import { NextResponse } from "next/server";
import { getDb, logAudit, newId, saveDb } from "@/lib/db";
import { generateRebuttal } from "@/lib/ai";
import { checkContent } from "@/lib/compliance";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// POST — draft a filing-cited rebuttal to a threat; it lands in the Do queue for approval.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").slice(0, 200);
  const evidence = body.evidence ? String(body.evidence).slice(0, 400) : undefined;
  if (!title) return NextResponse.json({ error: "Missing threat." }, { status: 422 });

  const db = getDb();
  const publicContext = db.filings.slice(0, 4).map((f) => `${f.form} (${f.filedAt.slice(0, 10)}): ${f.summary}`).join(" | ");
  const { tweets, engine } = await generateRebuttal(title, evidence, db.company, publicContext);

  const draft: Draft = {
    id: newId("drf"),
    kind: "cadence",
    title: `Rebuttal: ${title.slice(0, 60)}`,
    tweets,
    status: "pending",
    complianceFlags: checkContent(tweets),
    createdAt: new Date().toISOString(),
    aiEngine: engine,
  };
  db.drafts.unshift(draft);
  logAudit(db, "threat-radar", "REBUTTAL_DRAFTED", `Filing-cited rebuttal drafted for: ${title}`);
  saveDb(db);

  return NextResponse.json(draft);
}

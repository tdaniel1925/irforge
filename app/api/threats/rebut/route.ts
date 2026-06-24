import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
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

  const { db, save } = await getStore();
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

  // Close Dru's loop: also drop a reminder on the IR calendar (today) so the
  // drafted response is tracked on the calendar, not just the approval queue.
  db.calendar = db.calendar ?? [];
  db.calendar.push({
    id: newId("cal"),
    date: new Date().toISOString().slice(0, 10),
    title: `Respond: ${title.slice(0, 60)}`,
    type: "reminder",
    note: "AI drafted a filing-cited response — review & approve it in Social Media Approvals.",
  });
  db.calendar.sort((a, b) => a.date.localeCompare(b.date));

  logAudit(db, "threat-radar", "REBUTTAL_DRAFTED", `Filing-cited rebuttal drafted for: ${title} (added to IR calendar)`);
  await save();

  return NextResponse.json(draft);
}

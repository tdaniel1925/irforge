import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { generateInvestorTargets } from "@/lib/ai";
import type { InvestorTarget } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST — build a research list of institutional-investor targets for this company
// and draft a compliant intro note for each. Replaces any prior generated list.
export async function POST() {
  const { db, save } = await getStore();

  const { targets, engine } = await generateInvestorTargets(db.company);
  if (!targets.length) {
    return NextResponse.json({ error: "Couldn't generate targets right now. Try again in a moment." }, { status: 502 });
  }

  const now = Date.now();
  db.investors = targets.map((t, i) => ({
    id: `inv_${now}_${i}`,
    fund: t.fund,
    type: t.type,
    aum: t.aum,
    peersHeld: t.peersHeld,
    positionNote: t.positionNote,
    stage: "identified",
    outreachDraft: t.outreachDraft,
  })) satisfies InvestorTarget[];

  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "INVESTORS_GENERATED", `Generated ${db.investors.length} fund targets (${engine})`);
  await save();

  return NextResponse.json({ ok: true, count: db.investors.length, engine });
}

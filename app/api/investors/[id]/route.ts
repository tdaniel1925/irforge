import { NextResponse } from "next/server";
import { getDb, logAudit, saveDb } from "@/lib/db";
import type { InvestorStage } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGES: InvestorStage[] = ["identified", "outreach_drafted", "contacted", "meeting", "holder"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { stage } = (await req.json()) as { stage: InvestorStage };
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 422 });

  const db = getDb();
  const inv = db.investors.find((i) => i.id === params.id);
  if (!inv) return NextResponse.json({ error: "Investor not found" }, { status: 404 });

  inv.stage = stage;
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "INVESTOR_STAGE", `${inv.fund} → ${stage}`);
  saveDb(db);
  return NextResponse.json(inv);
}

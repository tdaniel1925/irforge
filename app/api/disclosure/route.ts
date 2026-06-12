import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { checkDisclosure } from "@/lib/ai";
import type { DisclosureCheck } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

// POST — check whether an event is likely 8-K-material and draft starter language.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const event = String(body.event ?? "").trim().slice(0, 400);
  if (event.length < 8) return NextResponse.json({ error: "Describe the event in a sentence or two." }, { status: 422 });

  const { db, save } = await getStore();
  const { likelyMaterial, form, reasoning, draftLanguage } = await checkDisclosure(event, db.company);

  const check: DisclosureCheck = {
    id: newId("disc"),
    event,
    likelyMaterial,
    form,
    reasoning,
    draftLanguage,
    createdAt: new Date().toISOString(),
  };
  db.disclosureChecks.unshift(check);
  logAudit(db, "system", "DISCLOSURE_CHECKED", `Checked event: "${event.slice(0, 50)}" → ${form}`);
  await save();
  return NextResponse.json(check);
}

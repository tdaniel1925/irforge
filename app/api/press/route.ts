import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { generatePressRelease } from "@/lib/ai";
import { checkContent } from "@/lib/compliance";
import type { PressRelease } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST — draft a compliant press release on a topic.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim().slice(0, 300);
  if (topic.length < 5) return NextResponse.json({ error: "Describe what the release is about." }, { status: 422 });

  const { db, save } = await getStore();
  const publicContext = db.filings.slice(0, 4).map((f) => `${f.form}: ${f.summary}`).join(" | ");
  const { headline, dateline, body: prBody, engine } = await generatePressRelease(topic, db.company, publicContext);

  const pr: PressRelease = {
    id: newId("pr"),
    headline,
    dateline,
    body: prBody,
    status: "pending",
    complianceFlags: checkContent([headline, prBody]),
    createdAt: new Date().toISOString(),
  };
  db.pressReleases.unshift(pr);
  logAudit(db, "system", "PRESS_RELEASE_DRAFTED", `Drafted press release: "${headline.slice(0, 60)}" via ${engine}`);
  await save();
  return NextResponse.json(pr);
}

// PATCH — approve / reject a press release.
export async function PATCH(req: Request) {
  const { id, action } = await req.json().catch(() => ({}));
  const { db, save } = await getStore();
  const pr = db.pressReleases.find((p) => p.id === id);
  if (!pr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const approver = `${db.company.approverName} (${db.company.approverTitle})`;
  if (action === "approve") {
    pr.status = "approved";
    pr.decidedAt = new Date().toISOString();
    pr.decidedBy = approver;
    logAudit(db, approver, "PRESS_RELEASE_APPROVED", `Approved "${pr.headline.slice(0, 60)}"`);
  } else if (action === "reject") {
    pr.status = "rejected";
    logAudit(db, approver, "PRESS_RELEASE_REJECTED", `Rejected "${pr.headline.slice(0, 60)}"`);
  }
  await save();
  return NextResponse.json(pr);
}

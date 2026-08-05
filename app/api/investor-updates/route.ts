import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/authz/guard";
import { sendInvestorUpdate, listInvestorUpdates, listOptedInRecipients } from "@/lib/investorUpdates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // sends one email per recipient inline

// GET — history of sent updates + the current opted-in recipient count.
export async function GET() {
  const g = await requireCapability("crm");
  if (!g.ok) return g.response;
  const [updates, recipients] = await Promise.all([
    listInvestorUpdates(g.companyId),
    listOptedInRecipients(g.companyId),
  ]);
  return NextResponse.json({ updates, optedInCount: recipients.length });
}

// POST { subject, body } — send an update to all opted-in investors.
export async function POST(req: Request) {
  const g = await requireCapability("crm");
  if (!g.ok) return g.response;
  const b = await req.json().catch(() => ({}));
  const result = await sendInvestorUpdate({ subject: String(b.subject ?? ""), body: String(b.body ?? "") });
  if (!result.ok) return NextResponse.json({ error: result.error, flags: result.flags }, { status: 422 });
  return NextResponse.json({ ok: true, sent: result.sent, updateId: result.updateId });
}

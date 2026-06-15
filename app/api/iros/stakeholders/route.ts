import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listStakeholders, upsertStakeholder, deleteStakeholder, listInteractions, addInteraction, setInteractionStatus } from "@/lib/iros";
import { triageInbound } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "stakeholders"))) return { error: NextResponse.json({ error: "Stakeholders not enabled." }, { status: 403 }) };
  return { mine };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  const [stakeholders, interactions] = await Promise.all([listStakeholders(), listInteractions()]);
  return NextResponse.json({ stakeholders, interactions });
}

// POST handles several actions via { action }.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));

  if (body.action === "save") {
    const s = await upsertStakeholder(body.stakeholder ?? {});
    return s ? NextResponse.json({ ok: true, stakeholder: s }) : NextResponse.json({ error: "Couldn't save." }, { status: 422 });
  }

  if (body.action === "delete") {
    await deleteStakeholder(String(body.id));
    return NextResponse.json({ ok: true });
  }

  // Log an inbound message + run AI triage in one step.
  if (body.action === "inbound") {
    const message = String(body.message ?? "").trim();
    if (!message) return NextResponse.json({ error: "Empty message." }, { status: 422 });
    const t = await triageInbound(message, g.mine!.company);
    const interaction = await addInteraction({
      stakeholderId: body.stakeholderId ?? null,
      channel: body.channel ?? "other",
      direction: "inbound",
      summary: t.summary || message.slice(0, 120),
      body: message,
      suggestedOwner: t.category,
      suggestedReply: t.suggestedReply,
    });
    return NextResponse.json({ ok: true, interaction, triage: t });
  }

  if (body.action === "interaction_status") {
    await setInteractionStatus(String(body.id), String(body.status));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 422 });
}

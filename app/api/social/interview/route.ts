import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { buildStrategyContext, renderContextForPrompt } from "@/lib/social/strategy";
import { proposeStrategy } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST — take raw interview answers and return an AI-proposed strategy for the
// client to review/edit. Does NOT save — the client confirms via /api/social/strategy.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (!(await companyHasFeature(mine.id, "social"))) {
    return NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const ctx = await buildStrategyContext();
  if (!ctx) return NextResponse.json({ error: "No company context." }, { status: 422 });

  const proposal = await proposeStrategy(renderContextForPrompt(ctx), {
    goals: typeof body.goals === "string" ? body.goals : undefined,
    audience: typeof body.audience === "string" ? body.audience : undefined,
    tone: typeof body.tone === "string" ? body.tone : undefined,
    frequency: typeof body.frequency === "string" ? body.frequency : undefined,
    topics: typeof body.topics === "string" ? body.topics : undefined,
    platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : undefined,
  });

  return NextResponse.json({ ok: true, proposal, engine: proposal.engine });
}

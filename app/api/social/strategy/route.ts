import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { getStrategy, saveStrategy } from "@/lib/social/strategy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "social"))) return { error: NextResponse.json({ error: "Social Content Engine not enabled." }, { status: 403 }) };
  return { mine };
}

// GET — the company's saved social strategy (null if not set up yet).
export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({ strategy: await getStrategy() });
}

// POST — save/update the strategy (partial). Body mirrors SocialStrategy fields.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const strategy = await saveStrategy({
    goals: typeof body.goals === "string" ? body.goals : undefined,
    audience: typeof body.audience === "string" ? body.audience : undefined,
    tone: typeof body.tone === "string" ? body.tone : undefined,
    themes: Array.isArray(body.themes) ? body.themes.map(String) : undefined,
    platforms: Array.isArray(body.platforms) ? body.platforms.map(String) : undefined,
    postsPerWeek: typeof body.postsPerWeek === "number" ? body.postsPerWeek : undefined,
    dos: Array.isArray(body.dos) ? body.dos.map(String) : undefined,
    donts: Array.isArray(body.donts) ? body.donts.map(String) : undefined,
    voiceProfileId: body.voiceProfileId === null || typeof body.voiceProfileId === "string" ? body.voiceProfileId : undefined,
    interviewComplete: typeof body.interviewComplete === "boolean" ? body.interviewComplete : undefined,
  });
  if (!strategy) return NextResponse.json({ error: "Couldn't save strategy." }, { status: 422 });
  return NextResponse.json({ ok: true, strategy });
}

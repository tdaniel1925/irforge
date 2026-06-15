import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listVoices, upsertVoice, deleteVoice } from "@/lib/iros";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "voices"))) return { error: NextResponse.json({ error: "Voice profiles not enabled." }, { status: 403 }) };
  return { mine };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({ voices: await listVoices() });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const voice = await upsertVoice({
    id: body.id || undefined,
    name: body.name,
    roleTitle: body.roleTitle,
    guidance: body.guidance,
    styleExamples: Array.isArray(body.styleExamples) ? body.styleExamples : [],
    forbiddenPhrases: Array.isArray(body.forbiddenPhrases) ? body.forbiddenPhrases : [],
    active: body.active !== false,
  });
  if (!voice) return NextResponse.json({ error: "Couldn't save." }, { status: 422 });
  return NextResponse.json({ ok: true, voice });
}

export async function DELETE(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 422 });
  await deleteVoice(String(body.id));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { getVoice } from "@/lib/iros";
import { draftInVoice } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { topic, voiceProfileId? } — generate draft text (optionally in a voice).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  if (!(await companyHasFeature(mine.id, "calendar"))) return NextResponse.json({ error: "Not enabled." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const topic = String(body.topic ?? "").trim();
  if (!topic) return NextResponse.json({ error: "What should the post be about?" }, { status: 422 });

  const voiceRow = body.voiceProfileId ? await getVoice(String(body.voiceProfileId)) : null;
  const voice = voiceRow
    ? { name: voiceRow.name, roleTitle: voiceRow.roleTitle, guidance: voiceRow.guidance, styleExamples: voiceRow.styleExamples, forbiddenPhrases: voiceRow.forbiddenPhrases }
    : { name: mine.company.name, roleTitle: "", guidance: "professional, plain-spoken, credible", styleExamples: [], forbiddenPhrases: [] };

  const result = await draftInVoice(topic, voice, mine.company);
  return NextResponse.json({ ok: true, text: result.text, engine: result.engine });
}

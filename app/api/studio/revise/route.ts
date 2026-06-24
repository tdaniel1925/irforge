import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { getStore } from "@/lib/db";
import { reviseContent } from "@/lib/ai";
import { checkContent, hasBlockingFlags } from "@/lib/compliance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// POST { content, instruction } — apply an AI edit to the document and return the
// revised text + any compliance flags (so the editor can warn before publishing).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  const { db } = await getStore();
  // Works in both authed (Supabase) and local/demo mode.
  const company = mine?.company ?? db.company;
  if (!company) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const content = String(b.content ?? "");
  const instruction = String(b.instruction ?? "").trim();
  if (!instruction) return NextResponse.json({ error: "Tell the AI what to change." }, { status: 422 });

  const { text, engine } = await reviseContent(content, instruction, company);
  const flags = checkContent([text]);
  return NextResponse.json({ ok: true, text, engine, flags, blocked: hasBlockingFlags(flags) });
}

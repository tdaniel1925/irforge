import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { getStore } from "@/lib/db";
import { assistantReply } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 45;

// POST { messages: [{role, content}] } — the floating AI assistant. Grounded in
// the company's context; helps with IR questions, drafting help, and how-to.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  const { db } = await getStore();
  const company = mine?.company ?? db.company;

  const b = await req.json().catch(() => ({}));
  const messages = Array.isArray(b.messages) ? b.messages.slice(-10) : [];
  if (!messages.length) return NextResponse.json({ error: "Say something." }, { status: 422 });

  const reply = await assistantReply(messages, company);
  return NextResponse.json({ ok: true, reply });
}

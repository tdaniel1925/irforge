import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { writePostFromTopic } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST { topic } — AI writes a social post from the user's topic/idea, grounded in
// the company's public facts. Compliance-safe (no price/advice/touting). The draft
// is returned for the user to edit, preview, and approve — it does NOT publish.
export async function POST(req: Request) {
  const { topic } = (await req.json().catch(() => ({}))) as { topic?: string };
  const t = String(topic ?? "").trim();
  if (!t) return NextResponse.json({ error: "Tell the AI what to write about." }, { status: 422 });

  const { db } = await getStore();
  const text = await writePostFromTopic(t, db.company);
  if (!text) return NextResponse.json({ error: "Couldn't draft that — try a different topic." }, { status: 502 });
  return NextResponse.json({ text });
}

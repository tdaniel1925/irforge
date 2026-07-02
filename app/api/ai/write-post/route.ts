import { NextResponse } from "next/server";
import { getStore } from "@/lib/db";
import { writePostFromTopic } from "@/lib/ai";

export const dynamic = "force-dynamic";

// POST { topic } — AI writes a social post from the user's topic/idea, grounded in
// the company's public facts. Compliance-safe (no price/advice/touting). The draft
// is returned for the user to edit, preview, and approve — it does NOT publish.
export async function POST(req: Request) {
  const { topic } = (await req.json().catch(() => ({}))) as { topic?: string };
  const t = String(topic ?? "").trim().slice(0, 2_000); // cap the topic length
  if (!t) return NextResponse.json({ error: "Tell the AI what to write about." }, { status: 422 });

  const { db, authed } = await getStore();
  if (process.env.AUTH_ENABLED === "1" && !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const text = await writePostFromTopic(t, db.company);
  if (!text) return NextResponse.json({ error: "Couldn't draft that — try a different topic." }, { status: 502 });
  return NextResponse.json({ text });
}

import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { generateCadencePost } from "@/lib/ai";
import { checkContent, hasBlockingFlags } from "@/lib/compliance";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — generate a new cadence (between-news) draft
export async function POST() {
  const { db, save, authed } = await getStore();
  // AI-cost guard: when auth is enforced, anonymous callers must not reach the
  // model call below (token burn). Demo mode (AUTH_ENABLED off) still works.
  if (process.env.AUTH_ENABLED === "1" && !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const recentTitles = db.drafts.filter((d) => d.kind === "cadence").slice(0, 5).map((d) => d.title);
  const { tweets, engine, title } = await generateCadencePost(db.company, recentTitles);
  const flags = checkContent(tweets);

  const draft: Draft = {
    id: newId("drf"),
    kind: "cadence",
    title,
    tweets,
    status: hasBlockingFlags(flags) ? "blocked" : "pending",
    complianceFlags: flags,
    createdAt: new Date().toISOString(),
    aiEngine: engine,
  };
  db.drafts.unshift(draft);
  logAudit(db, "system", "DRAFT_CREATED", `Generated cadence draft via ${engine}`);
  await save();
  return NextResponse.json(draft);
}

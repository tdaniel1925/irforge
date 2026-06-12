import { NextResponse } from "next/server";
import { getDb, logAudit, newId, saveDb } from "@/lib/db";
import { generateReplyDraft } from "@/lib/ai";
import { checkContent } from "@/lib/compliance";
import type { Draft } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const db = getDb();
  const mention = db.mentions.find((m) => m.id === params.id);
  if (!mention) return NextResponse.json({ error: "Mention not found" }, { status: 404 });
  if (mention.replyDraftId) return NextResponse.json({ error: "Reply draft already exists" }, { status: 409 });

  // Replies are citation-locked: only public filing summaries are provided as context.
  const publicContext = db.filings
    .slice(0, 4)
    .map((f) => `${f.form} (${f.filedAt.slice(0, 10)}): ${f.summary}`)
    .join(" | ");

  const { tweets, engine } = await generateReplyDraft(mention, db.company, publicContext);

  const draft: Draft = {
    id: newId("drf"),
    kind: "reply",
    mentionId: mention.id,
    title: `Reply to ${mention.author}`,
    tweets,
    status: "pending",
    complianceFlags: checkContent(tweets),
    createdAt: new Date().toISOString(),
    aiEngine: engine,
  };
  db.drafts.unshift(draft);
  mention.replyDraftId = draft.id;

  logAudit(
    db,
    "system",
    mention.requiresNonPublicInfo ? "REPLY_DEFLECTED" : "DRAFT_CREATED",
    mention.requiresNonPublicInfo
      ? `${mention.id} requires non-public info — safe deflection drafted instead`
      : `Reply drafted for ${mention.author} from public record via ${engine}`
  );
  saveDb(db);
  return NextResponse.json(draft);
}

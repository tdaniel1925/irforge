import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { buildPublishedThread, checkContent, hasBlockingFlags, publishGate } from "@/lib/compliance";
import { postThreadToX } from "@/lib/ayrshare";
import { tierHasFeature, type Tier } from "@/lib/billing";
import { classifyRegFD } from "@/lib/ai";

export const dynamic = "force-dynamic";

type Action =
  | { action: "approve"; acknowledgeRisk?: boolean }
  | { action: "reject" }
  | { action: "publish" }
  | { action: "edit"; tweets: string[] };

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = (await req.json()) as Action;
  const { db, save } = await getStore();
  const draft = db.drafts.find((d) => d.id === params.id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const approver = `${db.company.approverName} (${db.company.approverTitle})`;

  switch (body.action) {
    case "edit": {
      draft.tweets = body.tweets.map((t) => t.trim()).filter(Boolean);
      draft.complianceFlags = checkContent(draft.tweets);
      const blocked = hasBlockingFlags(draft.complianceFlags);
      // Editing re-runs compliance and resets any prior decision.
      draft.status = blocked ? "blocked" : "pending";
      draft.decidedAt = undefined;
      draft.decidedBy = undefined;
      logAudit(db, approver, "DRAFT_EDITED", `${draft.id} edited; compliance re-run → ${draft.status}`);
      break;
    }
    case "approve": {
      if (hasBlockingFlags(draft.complianceFlags)) {
        return NextResponse.json({ error: "Cannot approve: draft contains blocked language. Edit it first." }, { status: 422 });
      }
      if (draft.status !== "pending") {
        return NextResponse.json({ error: `Cannot approve a draft in status '${draft.status}'.` }, { status: 422 });
      }
      // AI Reg FD pre-publication check (assist, not a guarantee). A "red" draft
      // looks like it may carry material non-public info — it should go through
      // counsel before it's approved for publishing, not be cleared by a regex.
      // Only enforced when the caller hasn't explicitly acknowledged the risk.
      if (!body.acknowledgeRisk) {
        const cls = await classifyRegFD(draft.tweets.join("\n\n"), db.company).catch(() => null);
        if (cls && cls.classification === "red") {
          logAudit(db, approver, "DRAFT_REGFD_RED", `${draft.id}: AI flagged possible material info — ${cls.reasoning}`);
          await save();
          return NextResponse.json({
            error: "This draft looks like it may contain material non-public information. Have your counsel review it before publishing — disclose it publicly and simultaneously, or revise the draft.",
            regFd: { classification: cls.classification, flags: cls.flags, reasoning: cls.reasoning },
            requiresAcknowledgement: true,
          }, { status: 409 });
        }
      }
      draft.status = "approved";
      draft.decidedAt = new Date().toISOString();
      draft.decidedBy = approver;
      logAudit(db, approver, "DRAFT_APPROVED", `Approved '${draft.title}' (${draft.id})`);
      break;
    }
    case "reject": {
      draft.status = "rejected";
      draft.decidedAt = new Date().toISOString();
      draft.decidedBy = approver;
      logAudit(db, approver, "DRAFT_REJECTED", `Rejected '${draft.title}' (${draft.id})`);
      break;
    }
    case "publish": {
      // Server-side tier enforcement: posting to X is a paid feature. Free tier can't publish.
      if (!tierHasFeature((db.company.tier ?? "free") as Tier, "publishX")) {
        return NextResponse.json({ error: "Posting to X requires a paid plan. Upgrade to publish." }, { status: 402 });
      }
      const gate = publishGate({ status: draft.status, flags: draft.complianceFlags, quietMode: db.company.quietMode });
      if (!gate.ok) {
        logAudit(db, "compliance-engine", "PUBLISH_REFUSED", `${draft.id}: ${gate.reason}`);
        await save();
        return NextResponse.json({ error: gate.reason }, { status: 422 });
      }
      const finalThread = buildPublishedThread(draft.tweets, db.company);
      const result = await postThreadToX(finalThread);
      if (!result.ok) {
        logAudit(db, "system", "PUBLISH_FAILED", `${draft.id}: ${result.error}`);
        await save();
        return NextResponse.json({ error: result.error }, { status: 502 });
      }
      draft.tweets = finalThread;
      draft.status = "posted";
      draft.postedAt = new Date().toISOString();
      draft.postUrl = result.postUrl;

      // Public answers also land on the ticker page — the simultaneous page+X publish is the Reg FD rail.
      if (draft.kind === "public_answer" && draft.questionId) {
        const q = db.publicQuestions.find((x) => x.id === draft.questionId);
        if (q) {
          q.status = "answered";
          q.answerText = `${draft.tweets[0]} — ${db.company.name} (verified)`;
          q.answeredAt = draft.postedAt;
          q.xPostUrl = result.postUrl;
          logAudit(db, "system", "QUESTION_ANSWERED", `${q.id} answered on the public page${result.posted ? " + X simultaneously" : " (X simulated)"}`);
        }
      }
      logAudit(
        db,
        "system",
        "PUBLISHED",
        result.posted
          ? `Posted ${draft.id} to X via Ayrshare${result.postUrl ? ` (${result.postUrl})` : ""} with mandatory disclosures appended`
          : `Posted ${draft.id} (simulated — no Ayrshare key) with mandatory disclosures appended`
      );
      break;
    }
  }

  await save();
  return NextResponse.json(draft);
}

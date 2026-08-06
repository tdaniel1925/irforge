import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { assertCompanyWritable } from "@/lib/authz/guard";
import { listOpenQuestions, postVerifiedReply } from "@/lib/board";
import { checkContent, hasBlockingFlags, buildChannelPost, CHANNEL_LIMITS } from "@/lib/compliance";
import { classifyRegFD, fitToLimit } from "@/lib/ai";
import { publishPerChannel } from "@/lib/ayrshare";
import { tierHasFeature, type Tier } from "@/lib/billing";
import { writeAudit, companyHasTierFeature } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Company-facing board Q&A. GET: open (unanswered) investor questions on the
// company's own board. POST: publish a VERIFIED company reply to a question.
// Auth: scoped to the caller's company (getMyCompany) — a company only ever sees
// and answers its OWN board.

export async function GET() {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!(await companyHasTierFeature(mine.id, mine.company.tier, "qa"))) {
    return NextResponse.json({ error: "The investor Q&A inbox is part of the Board plan.", needsUpgrade: true, needsFeature: "qa" }, { status: 403 });
  }
  const questions = await listOpenQuestions(mine.company.ticker);
  return NextResponse.json({ questions, count: questions.length });
}

// POST { questionId, body, alsoPostToX? } — post the company's verified reply to a
// question. The human clicking "Approve & post" IS the approval; if alsoPostToX is set,
// the reply ALSO cross-posts to X automatically (no second approval) — but every
// AUTOMATED compliance gate still runs first (blocked-language, Reg FD RED auto-block,
// mandatory X disclosure, 280-char fit, quiet mode, paid tier). X posting is
// best-effort: if a gate holds it or the send fails, the BOARD reply still succeeds and
// we report why X was skipped.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const frozen = await assertCompanyWritable(mine);
  if (frozen) return frozen;
  if (!(await companyHasTierFeature(mine.id, mine.company.tier, "qa"))) {
    return NextResponse.json({ error: "Answering investor questions is part of the Board plan.", needsUpgrade: true, needsFeature: "qa" }, { status: 403 });
  }

  const { questionId, body, alsoPostToX } = (await req.json().catch(() => ({}))) as { questionId?: string; body?: string; alsoPostToX?: boolean };
  const text = String(body ?? "").trim();
  if (!questionId) return NextResponse.json({ error: "Missing question." }, { status: 422 });
  if (text.length < 2) return NextResponse.json({ error: "Write a reply first." }, { status: 422 });

  // Same compliance gate as every other outbound message — a public reply must not
  // contain blocked language. (Applies to the board reply itself.)
  if (hasBlockingFlags(checkContent([text]))) {
    return NextResponse.json({ error: "That reply tripped a compliance flag — edit it and try again." }, { status: 409 });
  }

  let reply;
  try {
    reply = await postVerifiedReply({
      ticker: mine.company.ticker,
      parentId: String(questionId),
      body: text,
      company: mine.company,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't post the reply — try again." }, { status: 422 });
  }

  await writeAudit({
    companyId: mine.id,
    action: "board.verified_reply",
    entityType: "board_post",
    entityId: String(questionId),
    payload: { replyId: reply.id },
  });

  // ── Optional automatic cross-post to X (gated, best-effort) ──────────────────
  let x: { attempted: boolean; posted: boolean; skipped?: string; url?: string } = { attempted: false, posted: false };
  if (alsoPostToX) {
    x = { attempted: true, posted: false };
    try {
      x = await crossPostToX(text, mine);
    } catch {
      x = { attempted: true, posted: false, skipped: "Couldn't reach X — the board reply is live; posting to X failed." };
    }
    await writeAudit({
      companyId: mine.id,
      action: x.posted ? "board.reply_crossposted_x" : "board.reply_x_skipped",
      entityType: "board_post",
      entityId: String(questionId),
      payload: { replyId: reply.id, skipped: x.skipped ?? null },
    });
  }

  return NextResponse.json({ ok: true, reply, x });
}

// Run the full automated gate stack, then post to X. Returns why it was skipped if a
// gate held it — the caller keeps the board reply regardless.
async function crossPostToX(
  text: string,
  mine: { id: string; company: import("@/lib/types").Company }
): Promise<{ attempted: boolean; posted: boolean; skipped?: string; url?: string }> {
  const company = mine.company;

  // Gate: paid tier (X posting is a paid capability).
  if (!tierHasFeature((company.tier ?? "free") as Tier, "publishX")) {
    return { attempted: true, posted: false, skipped: "X posting needs a paid plan — reply is live on your board only." };
  }
  // Gate: quiet mode suspends all publishing.
  if (company.quietMode) {
    return { attempted: true, posted: false, skipped: "Quiet mode is ON — reply is live on your board, but publishing to X is paused." };
  }
  // Gate: an X account must actually be connected.
  if (!company.ayrshareProfileKey) {
    return { attempted: true, posted: false, skipped: "No X account connected — reply is live on your board only." };
  }

  // Gate: Reg FD auto-block. Auto-posting to X only happens for GREEN (routine /
  // already-public) answers. Both RED (likely material non-public info) and YELLOW
  // (sensitive / guidance-adjacent — worth a human's eyes) stay on the board and are
  // HELD from X. Only an explicit human can share those on X afterward.
  try {
    const reg = await classifyRegFD(text, company);
    if (reg.classification === "red") {
      return { attempted: true, posted: false, skipped: "Held from X: flagged as possible material non-public info (Reg FD red). It's live on your board; have it reviewed before sharing on X." };
    }
    if (reg.classification === "yellow") {
      return { attempted: true, posted: false, skipped: "Held from X: this answer is sensitive (Reg FD yellow) and needs a human's eyes before it's tweeted. It's live on your board; share it on X manually if it's fine." };
    }
  } catch {
    // If the classifier is unavailable, fail SAFE — don't auto-post to X.
    return { attempted: true, posted: false, skipped: "Couldn't run the Reg FD check — reply is live on your board; not auto-posted to X to be safe." };
  }

  // Build the X-flavored post (appends the mandatory short FLS + disclosure link).
  let xBody = buildChannelPost(text, company, "twitter");

  // Character-fit to 280 (keeping the disclosure). If still over after a fit attempt,
  // hold rather than post a truncated/half-disclosed tweet.
  const limit = CHANNEL_LIMITS.twitter ?? 280;
  if (xBody.length > limit) {
    const fitted = await fitToLimit(text, Math.max(40, limit - (xBody.length - text.length)), "twitter");
    if (fitted) xBody = buildChannelPost(fitted, company, "twitter");
  }
  if (xBody.length > limit) {
    return { attempted: true, posted: false, skipped: "Too long for X even after trimming — reply is live on your board; post to X manually." };
  }

  // Final blocked-language gate on the exact text that will go to X.
  if (hasBlockingFlags(checkContent([xBody]))) {
    return { attempted: true, posted: false, skipped: "The X version tripped a compliance flag — reply is live on your board only." };
  }

  const result = await publishPerChannel({ twitter: xBody }, company.ayrshareProfileKey);
  if (!result.ok) {
    return { attempted: true, posted: false, skipped: result.error ?? "X post failed — reply is live on your board." };
  }
  return { attempted: true, posted: true, url: result.postUrl };
}

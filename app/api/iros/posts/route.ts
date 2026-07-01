import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { companyHasFeature } from "@/lib/platform";
import { listPosts, createPost, getPost, updatePostFields, canTransition } from "@/lib/iros";
import { writeAudit } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  const mine = await getMyCompany();
  if (!mine) return { error: NextResponse.json({ error: "Sign in." }, { status: 401 }) };
  if (!(await companyHasFeature(mine.id, "calendar"))) return { error: NextResponse.json({ error: "Editorial calendar not enabled." }, { status: 403 }) };
  return { mine };
}

export async function GET() {
  const g = await guard();
  if (g.error) return g.error;
  return NextResponse.json({ posts: await listPosts() });
}

// POST { title, body, channels?, scheduledAt?, voiceProfileId? } — create a draft.
export async function POST(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  if (!String(body.body ?? "").trim()) return NextResponse.json({ error: "Write something first." }, { status: 422 });
  const post = await createPost({
    title: String(body.title ?? ""),
    body: String(body.body ?? ""),
    channels: Array.isArray(body.channels) ? body.channels : [],
    scheduledAt: body.scheduledAt ?? null,
    voiceProfileId: body.voiceProfileId ?? null,
  });
  if (!post) return NextResponse.json({ error: "Couldn't create." }, { status: 422 });
  return NextResponse.json({ ok: true, post });
}

// PATCH { id, action: 'transition', to } | { id, ...fields } — edit or move status.
export async function PATCH(req: Request) {
  const g = await guard();
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });

  if (body.action === "transition") {
    const to = String(body.to ?? "");
    if (!canTransition(post.status, to)) return NextResponse.json({ error: `Can't move from ${post.status} to ${to}.` }, { status: 422 });
    const updated = await updatePostFields(id, { status: to });
    await writeAudit({ companyId: g.mine!.id, action: `post.${to}`, entityType: "post", entityId: id, payload: { from: post.status, to } });
    return NextResponse.json({ ok: true, post: updated });
  }

  // Field edits (title/body/channels/scheduledAt).
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (typeof body.body === "string") patch.body = body.body.slice(0, 4000);
  if (Array.isArray(body.channels)) patch.channels = body.channels;
  if (body.scheduledAt !== undefined) patch.scheduled_at = body.scheduledAt;

  // COMPLIANCE GUARD: editing the CONTENT of a post that already passed review must
  // send it back through review. Without this, a benign post could be approved, then
  // rewritten with material content and published — bypassing the Reg FD gate the
  // product exists to enforce. Published posts can't be content-edited at all.
  const contentChanged =
    (typeof body.title === "string" && body.title !== post.title) ||
    (typeof body.body === "string" && body.body !== post.body);
  if (contentChanged && post.status === "published") {
    return NextResponse.json({ error: "This post is already published — it can't be edited. Create a new post instead." }, { status: 409 });
  }
  if (contentChanged && post.status !== "draft") {
    // Back to draft + wipe the stale classification so the Reg FD check re-runs on
    // the NEW text before it can be re-approved.
    patch.status = "draft";
    patch.classification = null;
    patch.class_confidence = null;
    patch.class_flags = [];
    patch.class_reason = "";
    await writeAudit({
      companyId: g.mine!.id,
      action: "post.edited_after_review",
      entityType: "post",
      entityId: id,
      payload: { from: post.status, to: "draft", reason: "content changed — review reset" },
    });
  }

  const updated = await updatePostFields(id, patch);
  return NextResponse.json({ ok: true, post: updated });
}

import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { assertCompanyWritable } from "@/lib/authz/guard";
import { companyHasFeature, writeAudit } from "@/lib/platform";
import { getPost, updatePostFields } from "@/lib/iros";
import { publishToChannels } from "@/lib/ayrshare";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { postId, channels } — publish an APPROVED post to the chosen channels.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const frozen = await assertCompanyWritable(mine);
  if (frozen) return frozen;
  if (!(await companyHasFeature(mine.id, "publishing"))) {
    return NextResponse.json({ error: "Publishing not enabled." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const post = await getPost(String(body.postId ?? ""));
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  // Compliance gate: only approved or scheduled posts can go out. RED must have
  // gone through counsel (which set it to approved) — never publish a raw RED.
  if (!["approved", "scheduled"].includes(post.status)) {
    return NextResponse.json({ error: "Only approved posts can be published. Run it through review first." }, { status: 422 });
  }

  const channels = Array.isArray(body.channels) && body.channels.length ? body.channels : post.channels;
  if (!channels.length) return NextResponse.json({ error: "Pick at least one channel." }, { status: 422 });

  const result = await publishToChannels(post.title ? `${post.title}\n\n${post.body}` : post.body, channels, mine.company.ayrshareProfileKey);
  if (!result.ok) {
    await writeAudit({ companyId: mine.id, action: "post.publish_failed", entityType: "post", entityId: post.id, payload: { error: result.error, channels } });
    return NextResponse.json({ error: result.error ?? "Publish failed." }, { status: 502 });
  }

  await updatePostFields(post.id, { status: "published", channels });
  await writeAudit({
    companyId: mine.id,
    action: result.posted ? "post.published" : "post.published_simulated",
    entityType: "post",
    entityId: post.id,
    payload: { channels, postUrl: result.postUrl ?? null, posted: result.posted },
  });

  return NextResponse.json({ ok: true, posted: result.posted, postUrl: result.postUrl });
}

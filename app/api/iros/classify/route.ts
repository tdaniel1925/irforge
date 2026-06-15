import { NextResponse } from "next/server";
import { getPost, saveClassification } from "@/lib/iros";
import { getMyCompany } from "@/lib/supabase/store";
import { classifyRegFD } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { postId } — run the Reg FD classifier on a draft and save the result.
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const postId = String(body.postId ?? "");
  const post = await getPost(postId);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const result = await classifyRegFD(post.body, mine.company);
  await saveClassification(postId, {
    classification: result.classification,
    confidence: result.confidence,
    flags: result.flags,
    reasoning: result.reasoning,
  });

  return NextResponse.json({ ok: true, ...result });
}

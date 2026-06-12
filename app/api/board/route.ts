import { NextResponse } from "next/server";
import { addBoardPost, getBoardPage, reactToPost, type ReactionKind } from "@/lib/publicStats";
import { moderateBoardPost } from "@/lib/ai";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const ticker = u.searchParams.get("ticker") ?? "";
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const { posts, totalRoots } = getBoardPage(ticker, offset, PAGE_SIZE);
  return NextResponse.json({ posts, totalRoots, offset, pageSize: PAGE_SIZE, hasMore: offset + PAGE_SIZE < totalRoots });
}

// Public message board post. Runs through the same banned-claims filter as everything
// else — a compliance-branded platform cannot host "going to $10" pump posts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Reaction path
  if (body.react && body.postId) {
    const valid: ReactionKind[] = ["agree", "source", "question", "report"];
    if (!valid.includes(body.react)) return NextResponse.json({ error: "bad reaction" }, { status: 422 });
    const post = reactToPost(String(body.postId), body.react);
    if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
    return NextResponse.json({ ok: true, post });
  }

  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const author = String(body.author ?? "").trim().slice(0, 40) || "Anonymous";
  const text = String(body.body ?? "").trim().slice(0, 600);
  const parentId = body.parentId ? String(body.parentId) : undefined;

  if (!ticker || text.length < 2) {
    return NextResponse.json({ error: "Write something first." }, { status: 422 });
  }

  // AI labels the post by signal quality (factual/opinion/hype/fud/chatter); readers filter.
  // Only genuinely abusive/illegal content is hard-blocked.
  const verdict = await moderateBoardPost(text);
  if (verdict.block) {
    return NextResponse.json(
      { error: `This can't be posted — ${verdict.reason} Threats, harassment, and coordinated manipulation aren't allowed.` },
      { status: 422 }
    );
  }

  const post = addBoardPost({
    ticker,
    author,
    body: text,
    ts: new Date().toISOString(),
    verified: false,
    flag: verdict.flag,
    flagReason: verdict.reason,
    parentId,
  });
  return NextResponse.json({ ok: true, post, moderation: verdict.engine });
}

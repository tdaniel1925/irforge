import { NextResponse } from "next/server";
import { addBoardPost, getBoardPage, reactToPost, rateAllow, type ReactionKind } from "@/lib/publicStats";
import { moderateBoardPost } from "@/lib/ai";
import { getMyMember } from "@/lib/members";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 15;

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "anon").trim();
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const ticker = u.searchParams.get("ticker") ?? "";
  const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
  const { posts, totalRoots } = await getBoardPage(ticker, offset, PAGE_SIZE);
  return NextResponse.json({ posts, totalRoots, offset, pageSize: PAGE_SIZE, hasMore: offset + PAGE_SIZE < totalRoots });
}

// Public message board post. Runs through the same banned-claims filter as everything
// else — a compliance-branded platform cannot host "going to $10" pump posts.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ip = clientIp(req);

  // Reaction path (looser limit — reactions are cheap).
  if (body.react && body.postId) {
    if (!(await rateAllow(`react:${ip}`, 60))) return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });
    const valid: ReactionKind[] = ["agree", "source", "question", "report"];
    if (!valid.includes(body.react)) return NextResponse.json({ error: "bad reaction" }, { status: 422 });
    const post = await reactToPost(String(body.postId), body.react);
    if (!post) return NextResponse.json({ error: "post not found" }, { status: 404 });
    return NextResponse.json({ ok: true, post });
  }

  // Posting now requires a signed-in investor (member) account. Identity comes
  // from the member profile — the client can no longer spoof an author name.
  const me = await getMyMember();
  if (!me) {
    return NextResponse.json({ error: "Sign in as an investor to post.", needsAuth: true }, { status: 401 });
  }

  // Rate limit per member.
  if (!(await rateAllow(`board:${me.id}`, 5))) {
    return NextResponse.json({ error: "You're posting too fast — try again in a minute." }, { status: 429 });
  }

  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const author = me.member.handle;
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

  const post = await addBoardPost({
    ticker,
    author,
    body: text,
    ts: new Date().toISOString(),
    verified: false,
    flag: verdict.flag,
    flagReason: verdict.reason,
    parentId,
    memberId: me.id,
    authorAvatar: me.member.avatarUrl,
  });
  return NextResponse.json({ ok: true, post, moderation: verdict.engine });
}

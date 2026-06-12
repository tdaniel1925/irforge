import fs from "fs";
import path from "path";
import { createServiceClient } from "./supabase/server";

// Public data (board posts, leads, view counts) for the public ticker pages.
// Dual-mode: persists to Supabase when configured (survives Vercel deploys), else
// to a local JSON file for the single-machine demo. All functions are async.

const FILE = path.join(process.cwd(), "data", "public-stats.json");
const supabaseEnabled = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export interface ClaimLead {
  ticker: string;
  name: string;
  email: string;
  role: string;
  ts: string;
}

export type ReactionKind = "agree" | "source" | "question" | "report";

export interface BoardPost {
  id: string;
  ticker: string;
  author: string;
  body: string;
  ts: string;
  verified: boolean;
  flag: string;
  flagReason: string;
  parentId?: string;
  reactions: Record<ReactionKind, number>;
}

export const EMPTY_REACTIONS: Record<ReactionKind, number> = { agree: 0, source: 0, question: 0, report: 0 };

// ---------- local JSON fallback ----------
interface Stats { views: Record<string, number>; leads: ClaimLead[]; board: BoardPost[] }
function readLocal(): Stats {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return { views: s.views ?? {}, leads: s.leads ?? [], board: s.board ?? [] };
  } catch {
    return { views: {}, leads: [], board: [] };
  }
}
function writeLocal(s: Stats): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf-8");
  fs.renameSync(tmp, FILE);
}

// Map a Supabase row (snake_case) to BoardPost.
function rowToPost(r: Record<string, unknown>): BoardPost {
  return {
    id: String(r.id),
    ticker: String(r.ticker),
    author: String(r.author ?? "Anonymous"),
    body: String(r.body ?? ""),
    ts: String(r.created_at ?? new Date().toISOString()),
    verified: Boolean(r.verified),
    flag: String(r.flag ?? "chatter"),
    flagReason: String(r.flag_reason ?? ""),
    parentId: r.parent_id ? String(r.parent_id) : undefined,
    reactions: { ...EMPTY_REACTIONS, ...((r.reactions as Record<ReactionKind, number>) ?? {}) },
  };
}

// ---------- views ----------
export async function bumpViews(ticker: string): Promise<number> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data } = await svc.rpc("bump_ticker_views", { t: T });
    return Number(data ?? 1);
  }
  const s = readLocal();
  s.views[T] = (s.views[T] ?? 0) + 1;
  writeLocal(s);
  return s.views[T];
}

// ---------- leads ----------
export async function addLead(lead: ClaimLead): Promise<void> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    await svc.from("leads").insert({ ticker: lead.ticker, name: lead.name, email: lead.email, role: lead.role });
    return;
  }
  const s = readLocal();
  s.leads.push(lead);
  writeLocal(s);
}

// ---------- board ----------
let boardCounter = 0;
export async function addBoardPost(p: Omit<BoardPost, "id" | "reactions">): Promise<BoardPost> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data } = await svc.from("public_board").insert({
      ticker: p.ticker, author: p.author, body: p.body, verified: p.verified,
      flag: p.flag, flag_reason: p.flagReason, parent_id: p.parentId ?? null,
      reactions: EMPTY_REACTIONS,
    }).select("*").single();
    return data ? rowToPost(data) : { ...p, id: "err", reactions: { ...EMPTY_REACTIONS } };
  }
  const s = readLocal();
  boardCounter = (boardCounter + 1) % 10000;
  const post: BoardPost = { ...p, id: `brd_${Date.now().toString(36)}${boardCounter.toString(36)}`, reactions: { ...EMPTY_REACTIONS } };
  s.board.unshift(post);
  if (s.board.length > 4000) s.board = s.board.slice(0, 4000);
  writeLocal(s);
  return post;
}

// Demo seed (used by both stores so a fresh ticker board shows the two-zone layout).
function demoSeeds(T: string): Omit<BoardPost, "id" | "reactions">[] {
  const now = Date.now();
  const base = { ticker: T, verified: false, flag: "chatter", flagReason: "" };
  return [
    { ...base, author: `${T} (Investor Relations)`, verified: true, flag: "verified", body: `Thanks for the questions on our latest results — full details are in our filings, and we answer here regularly. Welcome to the $${T} board.`, ts: new Date(now - 2 * 3600e3).toISOString() },
    { ...base, author: "drillcore_dan", flag: "factual", flagReason: "States figures attributable to the public filings.", body: `Cash position looks solid per the last 10-Q. Runway into next year even with the accelerated program.`, ts: new Date(now - 5 * 3600e3).toISOString() },
    { ...base, author: "valuewatch", flag: "opinion", flagReason: "A reasoned bearish take with a stated basis — opinion, not manipulation.", body: `Constructive but cautious — I'd want to see the feasibility study before sizing up. Dilution is the risk.`, ts: new Date(now - 9 * 3600e3).toISOString() },
    { ...base, author: "anon4471", flag: "fud", flagReason: "Baseless accusation with no factual support — fear-mongering, not analysis.", body: `This is a pump and dump, management are scammers, the cash is gone and they're hiding it. Get out before zero.`, ts: new Date(now - 4 * 3600e3).toISOString() },
  ];
}

async function allPosts(ticker: string): Promise<BoardPost[]> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    let { data } = await svc.from("public_board").select("*").eq("ticker", T).order("created_at", { ascending: false }).limit(4000);
    if (!data || data.length === 0) {
      // Seed once.
      const seeds = demoSeeds(T).map((p) => ({ ticker: p.ticker, author: p.author, body: p.body, verified: p.verified, flag: p.flag, flag_reason: p.flagReason, reactions: EMPTY_REACTIONS, created_at: p.ts }));
      await svc.from("public_board").insert(seeds);
      ({ data } = await svc.from("public_board").select("*").eq("ticker", T).order("created_at", { ascending: false }).limit(4000));
    }
    return (data ?? []).map(rowToPost);
  }
  // local
  const s = readLocal();
  if (!s.board.some((p) => p.ticker === T)) {
    let c = 0;
    const seeds = demoSeeds(T).map((p) => ({ ...p, id: `seed_${T}_${(c++).toString(36)}`, reactions: { ...EMPTY_REACTIONS } }));
    s.board.unshift(...seeds);
    writeLocal(s);
  }
  return s.board.filter((p) => p.ticker === T).map((p) => ({ ...p, reactions: { ...EMPTY_REACTIONS, ...(p.reactions ?? {}) } }));
}

export async function getBoardPosts(ticker: string, limit = 200): Promise<BoardPost[]> {
  return (await allPosts(ticker)).slice(0, limit);
}

export async function getBoardPage(ticker: string, offset = 0, limit = 15): Promise<{ posts: BoardPost[]; totalRoots: number }> {
  const all = await allPosts(ticker);
  const roots = all.filter((p) => !p.parentId);
  const pageRoots = roots.slice(offset, offset + limit);
  const pageIds = new Set(pageRoots.map((r) => r.id));
  const replies = all.filter((p) => p.parentId && belongsTo(p, pageIds, all));
  return { posts: [...pageRoots, ...replies], totalRoots: roots.length };
}

function belongsTo(post: BoardPost, rootIds: Set<string>, all: BoardPost[]): boolean {
  let cur: BoardPost | undefined = post;
  const seen = new Set<string>();
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (rootIds.has(cur.parentId)) return true;
    cur = all.find((p) => p.id === cur!.parentId);
  }
  return false;
}

export async function reactToPost(postId: string, kind: ReactionKind): Promise<BoardPost | null> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data: row } = await svc.from("public_board").select("reactions").eq("id", postId).single();
    if (!row) return null;
    const reactions = { ...EMPTY_REACTIONS, ...((row.reactions as Record<ReactionKind, number>) ?? {}) };
    reactions[kind] = (reactions[kind] ?? 0) + 1;
    const { data } = await svc.from("public_board").update({ reactions }).eq("id", postId).select("*").single();
    return data ? rowToPost(data) : null;
  }
  const s = readLocal();
  const post = s.board.find((p) => p.id === postId);
  if (!post) return null;
  post.reactions = { ...EMPTY_REACTIONS, ...(post.reactions ?? {}) };
  post.reactions[kind] = (post.reactions[kind] ?? 0) + 1;
  writeLocal(s);
  return post;
}

// ---------- rate limiting ----------
// Returns true if the action is ALLOWED. Window-bucketed per key.
export async function rateAllow(key: string, maxPerMinute: number): Promise<boolean> {
  const windowId = Math.floor(Date.now() / 60000); // 1-minute window
  const bucket = `${key}:${windowId}`;
  if (supabaseEnabled()) {
    try {
      const svc = createServiceClient();
      const { data } = await svc.rpc("rate_check", { b: bucket, max_hits: maxPerMinute });
      return data !== false;
    } catch {
      return true; // fail open — never block a real user on a rate-limit infra error
    }
  }
  // local in-memory fallback
  localBuckets[bucket] = (localBuckets[bucket] ?? 0) + 1;
  return localBuckets[bucket] <= maxPerMinute;
}
const localBuckets: Record<string, number> = {};

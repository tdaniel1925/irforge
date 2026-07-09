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

export interface WatchSub {
  ticker: string;
  email: string;
  ts: string;
}

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
  memberId?: string;       // null for legacy/anonymous posts
  authorAvatar?: string;   // member avatar url, if any
}

export const EMPTY_REACTIONS: Record<ReactionKind, number> = { agree: 0, source: 0, question: 0, report: 0 };

// ---------- local JSON fallback ----------
interface Stats { views: Record<string, number>; leads: ClaimLead[]; board: BoardPost[]; watches: WatchSub[]; snapshots?: Record<string, WatchSnapshot> }
function readLocal(): Stats {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return { views: s.views ?? {}, leads: s.leads ?? [], board: s.board ?? [], watches: s.watches ?? [], snapshots: s.snapshots ?? {} };
  } catch {
    return { views: {}, leads: [], board: [], watches: [], snapshots: {} };
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
    memberId: r.member_id ? String(r.member_id) : undefined,
    authorAvatar: (r.author_avatar as string) ?? undefined,
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

// ---------- watch / alerts ----------
// Stores a "notify me about $TICKER" subscription. Email dispatch is wired
// separately (a cron/worker reads these); here we just durably capture intent.
export async function addWatch(sub: WatchSub & { memberId?: string }): Promise<{ ok: boolean; already: boolean }> {
  const ticker = sub.ticker.toUpperCase();
  const email = sub.email.trim().toLowerCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data: existing } = await svc.from("watches").select("id").eq("ticker", ticker).eq("email", email).maybeSingle();
    if (existing) {
      // Backfill member_id if a logged-in member re-watches an email-only sub.
      if (sub.memberId) await svc.from("watches").update({ member_id: sub.memberId }).eq("id", existing.id);
      return { ok: true, already: true };
    }
    await svc.from("watches").insert({ ticker, email, member_id: sub.memberId ?? null });
    return { ok: true, already: false };
  }
  const s = readLocal();
  const already = s.watches.some((w) => w.ticker === ticker && w.email === email);
  if (!already) {
    s.watches.push({ ticker, email, ts: sub.ts });
    writeLocal(s);
  }
  return { ok: true, already };
}

// Remove a member's watch (used by the watchlist UI).
export async function removeWatchByMember(memberId: string, ticker: string): Promise<void> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    await svc.from("watches").delete().eq("member_id", memberId).eq("ticker", T);
  }
}

// All distinct tickers that have at least one watcher (for the alert worker).
export async function getWatchedTickers(): Promise<string[]> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data } = await svc.from("watches").select("ticker").limit(5000);
    return Array.from(new Set((data ?? []).map((r) => String(r.ticker).toUpperCase())));
  }
  const s = readLocal();
  return Array.from(new Set(s.watches.map((w) => w.ticker.toUpperCase())));
}

// Email addresses watching a given ticker.
export async function getWatchersFor(ticker: string): Promise<string[]> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data } = await svc.from("watches").select("email").eq("ticker", T).limit(5000);
    return Array.from(new Set((data ?? []).map((r) => String(r.email))));
  }
  const s = readLocal();
  return Array.from(new Set(s.watches.filter((w) => w.ticker.toUpperCase() === T).map((w) => w.email)));
}

// ---------- watch snapshots (change detection for the alert worker) ----------
export interface WatchSnapshot {
  lastFilingDate?: string;
  lastForm?: string;
  insiderBuys?: number;
  insiderSells?: number;
  haltCount?: number;
  grade?: string;
}

export async function getWatchSnapshot(ticker: string): Promise<WatchSnapshot | null> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data } = await svc.from("watch_snapshots").select("snapshot").eq("ticker", T).maybeSingle();
    return (data?.snapshot as WatchSnapshot) ?? null;
  }
  const s = readLocal();
  return s.snapshots?.[T] ?? null;
}

export async function setWatchSnapshot(ticker: string, snap: WatchSnapshot): Promise<void> {
  const T = ticker.toUpperCase();
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    await svc.from("watch_snapshots").upsert({ ticker: T, snapshot: snap, updated_at: new Date().toISOString() });
    return;
  }
  const s = readLocal();
  s.snapshots = s.snapshots ?? {};
  s.snapshots[T] = snap;
  writeLocal(s);
}

// ---------- board ----------
let boardCounter = 0;
export async function addBoardPost(p: Omit<BoardPost, "id" | "reactions">): Promise<BoardPost> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { data, error } = await svc.from("public_board").insert({
      ticker: p.ticker, author: p.author, body: p.body, verified: p.verified,
      flag: p.flag, flag_reason: p.flagReason, parent_id: p.parentId ?? null,
      reactions: EMPTY_REACTIONS,
      member_id: p.memberId ?? null, author_avatar: p.authorAvatar ?? "",
    }).select("*").single();
    // Throw so callers report the failure — a silent fake post here meant the API
    // returned ok:true (and emailed the company) for a post that never persisted.
    if (error || !data) throw new Error(`board insert failed: ${error?.message ?? "no row returned"}`);
    return rowToPost(data);
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
    // PRODUCTION: never seed. Every ticker here is a REAL public company; the demo
    // seeds include a fabricated "pump and dump / scammers" accusation AND a fake
    // "verified" IR reply — planting either on a real company's public page is a
    // legal problem (defamation-adjacent + fake official statement), claimed or not.
    // Boards start genuinely empty until real investors (or the company) post.
    // Demo seeds live on only in the LOCAL no-Supabase demo below.
    const svc = createServiceClient();
    const { data } = await svc.from("public_board").select("*").eq("ticker", T).order("created_at", { ascending: false }).limit(4000);
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

// One reaction per member per post per kind — reacting again toggles it OFF.
// Reactions are rows in board_reactions (attributable, deduped); the JSONB
// counters on public_board are a recomputed display cache, so counts always
// equal real member reactions and can't be stuffed by repeat clicks.
export async function reactToPost(postId: string, kind: ReactionKind, memberId: string): Promise<BoardPost | null> {
  if (supabaseEnabled()) {
    const svc = createServiceClient();
    const { error: insErr } = await svc.from("board_reactions").insert({ post_id: postId, member_id: memberId, kind });
    if (insErr) {
      // Unique violation = already reacted -> toggle off. Anything else (e.g. bad
      // post id FK) = post not found.
      if (insErr.code !== "23505") return null;
      await svc.from("board_reactions").delete().eq("post_id", postId).eq("member_id", memberId).eq("kind", kind);
    }
    // Recount this post's reactions from the source of truth.
    const { data: rows } = await svc.from("board_reactions").select("kind").eq("post_id", postId);
    const reactions = { ...EMPTY_REACTIONS };
    for (const r of rows ?? []) {
      const k = r.kind as ReactionKind;
      if (k in reactions) reactions[k]++;
    }
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

// ---------- discovery / leaderboards ----------
// Powers the public "Discover" hub (our answer to iHub's Breakout/Most Read/etc).
export interface DiscoveryRow {
  ticker: string;
  views: number;
  posts: number; // total board posts
  posts24h: number;
  posts7d: number;
  lastActivity: string | null; // ISO of most recent post
}

export interface Discovery {
  mostRead: DiscoveryRow[]; // by views
  mostActive: DiscoveryRow[]; // by posts in last 24h
  trending: DiscoveryRow[]; // 24h posting velocity vs the prior 7d average
  mostPosted: DiscoveryRow[]; // by total posts
  recent: DiscoveryRow[]; // most recently active boards
  totalTickers: number;
}

function rankSlice(rows: DiscoveryRow[], by: (r: DiscoveryRow) => number, limit: number): DiscoveryRow[] {
  return rows.filter((r) => by(r) > 0).sort((a, b) => by(b) - by(a)).slice(0, limit);
}

// Trending score: how much the last 24h of posting beats the trailing daily
// average. New, suddenly-busy boards rise even if their absolute count is small.
function trendScore(r: DiscoveryRow): number {
  const priorDaily = Math.max(0.2, (r.posts7d - r.posts24h) / 7);
  return r.posts24h / priorDaily;
}

export async function getDiscovery(limit = 15): Promise<Discovery> {
  const now = Date.now();
  const DAY = 86400e3;
  const byTicker = new Map<string, DiscoveryRow>();
  const get = (t: string): DiscoveryRow => {
    const T = t.toUpperCase();
    let r = byTicker.get(T);
    if (!r) {
      r = { ticker: T, views: 0, posts: 0, posts24h: 0, posts7d: 0, lastActivity: null };
      byTicker.set(T, r);
    }
    return r;
  };

  if (supabaseEnabled()) {
    const svc = createServiceClient();
    // Views per ticker.
    const { data: views } = await svc.from("ticker_views").select("ticker, views");
    for (const v of views ?? []) get(String(v.ticker)).views = Number(v.views ?? 0);
    // Board posts (cap pull for aggregation).
    const { data: posts } = await svc
      .from("public_board")
      .select("ticker, created_at")
      .order("created_at", { ascending: false })
      .limit(20000);
    for (const p of posts ?? []) {
      const r = get(String(p.ticker));
      const ts = String(p.created_at ?? "");
      const age = now - new Date(ts).getTime();
      r.posts += 1;
      if (age <= DAY) r.posts24h += 1;
      if (age <= 7 * DAY) r.posts7d += 1;
      if (!r.lastActivity || ts > r.lastActivity) r.lastActivity = ts;
    }
  } else {
    const s = readLocal();
    for (const [t, n] of Object.entries(s.views)) get(t).views = n;
    for (const p of s.board) {
      const r = get(p.ticker);
      const age = now - new Date(p.ts).getTime();
      r.posts += 1;
      if (age <= DAY) r.posts24h += 1;
      if (age <= 7 * DAY) r.posts7d += 1;
      if (!r.lastActivity || p.ts > r.lastActivity) r.lastActivity = p.ts;
    }
  }

  const rows = Array.from(byTicker.values());
  return {
    mostRead: rankSlice(rows, (r) => r.views, limit),
    mostActive: rankSlice(rows, (r) => r.posts24h, limit),
    trending: rows.filter((r) => r.posts24h > 0).sort((a, b) => trendScore(b) - trendScore(a)).slice(0, limit),
    mostPosted: rankSlice(rows, (r) => r.posts, limit),
    recent: rows
      .filter((r) => r.lastActivity)
      .sort((a, b) => (b.lastActivity! > a.lastActivity! ? 1 : -1))
      .slice(0, limit),
    totalTickers: rows.length,
  };
}

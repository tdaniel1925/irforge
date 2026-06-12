import fs from "fs";
import path from "path";

// View counts and claim leads for the public ticker pages.
// Separate store from the main app db — public traffic shouldn't touch customer data.

const FILE = path.join(process.cwd(), "data", "public-stats.json");

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
  verified: boolean; // true = posted by the claimed company through the approval flow
  flag: string; // factual | opinion | hype | fud | chatter | verified
  flagReason: string;
  parentId?: string; // set for replies (Facebook-style threading)
  reactions: Record<ReactionKind, number>;
}

export const EMPTY_REACTIONS: Record<ReactionKind, number> = { agree: 0, source: 0, question: 0, report: 0 };

interface Stats {
  views: Record<string, number>;
  leads: ClaimLead[];
  board: BoardPost[];
}

function read(): Stats {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return { views: s.views ?? {}, leads: s.leads ?? [], board: s.board ?? [] };
  } catch {
    return { views: {}, leads: [], board: [] };
  }
}

function write(s: Stats): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), "utf-8");
  fs.renameSync(tmp, FILE);
}

export function bumpViews(ticker: string): number {
  const s = read();
  const key = ticker.toUpperCase();
  s.views[key] = (s.views[key] ?? 0) + 1;
  write(s);
  return s.views[key];
}

export function addLead(lead: ClaimLead): void {
  const s = read();
  s.leads.push(lead);
  write(s);
}

let boardCounter = 0;
export function addBoardPost(p: Omit<BoardPost, "id" | "reactions">): BoardPost {
  const s = read();
  boardCounter = (boardCounter + 1) % 10000;
  const post: BoardPost = { ...p, id: `brd_${Date.now().toString(36)}${boardCounter.toString(36)}`, reactions: { ...EMPTY_REACTIONS } };
  s.board.unshift(post);
  if (s.board.length > 4000) s.board = s.board.slice(0, 4000);
  write(s);
  return post;
}

export function getBoardPosts(ticker: string, limit = 200): BoardPost[] {
  const T = ticker.toUpperCase();
  const s = read();
  // One-time demo seed per ticker so the two-zone layout (pinned company + community) always shows.
  if (!s.board.some((p) => p.ticker === T)) {
    const now = Date.now();
    const mk = (o: Partial<BoardPost>): BoardPost => ({
      id: `seed_${T}_${Math.round(Math.random() * 1e6).toString(36)}`,
      ticker: T, author: "", body: "", ts: new Date(now).toISOString(),
      verified: false, flag: "chatter", flagReason: "", reactions: { ...EMPTY_REACTIONS }, ...o,
    });
    const seeds: BoardPost[] = [
      mk({ author: `${T} (Investor Relations)`, verified: true, flag: "verified", body: `Thanks for the questions on our latest results — full details are in our filings, and we answer here regularly. Welcome to the $${T} board.`, ts: new Date(now - 2 * 3600e3).toISOString(), reactions: { agree: 14, source: 3, question: 1, report: 0 } }),
      mk({ author: "drillcore_dan", flag: "factual", flagReason: "States figures attributable to the public filings.", body: `Cash position looks solid per the last 10-Q. Runway into next year even with the accelerated program.`, ts: new Date(now - 5 * 3600e3).toISOString(), reactions: { agree: 9, source: 5, question: 0, report: 0 } }),
      mk({ author: "valuewatch", flag: "opinion", flagReason: "A reasoned bearish take with a stated basis — opinion, not manipulation.", body: `Constructive but cautious — I'd want to see the feasibility study before sizing up. Dilution is the risk.`, ts: new Date(now - 9 * 3600e3).toISOString(), reactions: { agree: 6, source: 1, question: 2, report: 0 } }),
      mk({ author: "anon4471", flag: "fud", flagReason: "Baseless accusation with no factual support — fear-mongering, not analysis.", body: `This is a pump and dump, management are scammers, the cash is gone and they're hiding it. Get out before zero.`, ts: new Date(now - 4 * 3600e3).toISOString(), reactions: { agree: 1, source: 0, question: 0, report: 4 } }),
    ];
    s.board.unshift(...seeds);
    write(s);
  }
  return s.board.filter((p) => p.ticker === T).slice(0, limit).map((p) => ({ ...p, reactions: { ...EMPTY_REACTIONS, ...(p.reactions ?? {}) } }));
}

// Paged board read: returns a page of ROOT posts plus all their replies (so threads stay
// intact), and the total root count so the UI knows whether more remain.
export function getBoardPage(ticker: string, offset = 0, limit = 15): { posts: BoardPost[]; totalRoots: number } {
  const all = getBoardPosts(ticker, 4000);
  const roots = all.filter((p) => !p.parentId);
  const pageRoots = roots.slice(offset, offset + limit);
  const pageIds = new Set(pageRoots.map((r) => r.id));
  // Collect replies (and nested replies) belonging to the paged roots.
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

export function reactToPost(postId: string, kind: ReactionKind): BoardPost | null {
  const s = read();
  const post = s.board.find((p) => p.id === postId);
  if (!post) return null;
  post.reactions = { ...EMPTY_REACTIONS, ...(post.reactions ?? {}) };
  post.reactions[kind] = (post.reactions[kind] ?? 0) + 1;
  write(s);
  return post;
}

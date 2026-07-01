import { createServiceClient } from "./supabase/server";
import { addBoardPost } from "./publicStats";
import type { Company } from "./types";

// Board <-> company engagement layer. The public message board (public_board table)
// is where investors post comments and questions on a ticker's page. This module is
// the company-facing side: surface what's waiting, and let the company reply with a
// VERIFIED answer that appears back on the board. Shared by the badge, the digest
// email, the realtime notifier, and the Investor Q&A inbox so they agree on one
// definition of "unanswered".

export interface BoardQuestion {
  id: string;
  author: string;
  body: string;
  ts: string;
  answered: boolean;          // has a verified company reply
  replyCount: number;
}

export interface BoardActivity {
  newQuestions: BoardQuestion[];
  newComments: number;        // non-question, non-verified posts since `since`
  unansweredTotal: number;    // all-time open questions
}

const svc = () => createServiceClient();

// All posts for a ticker (roots + replies), newest first. Small helper so every
// query below works off the same fetch and we compute "answered" consistently.
async function fetchBoard(ticker: string): Promise<Record<string, unknown>[]> {
  const T = ticker.toUpperCase();
  const { data } = await svc()
    .from("public_board")
    .select("id, author, body, created_at, verified, flag, parent_id")
    .eq("ticker", T)
    .order("created_at", { ascending: false })
    .limit(2000);
  return data ?? [];
}

// A question is ANSWERED when it has at least one verified (company) reply.
function toQuestions(rows: Record<string, unknown>[]): BoardQuestion[] {
  const replyByParent = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const pid = r.parent_id ? String(r.parent_id) : null;
    if (pid) {
      const list = replyByParent.get(pid) ?? [];
      list.push(r);
      replyByParent.set(pid, list);
    }
  }
  return rows
    .filter((r) => String(r.flag) === "question" && !r.parent_id)
    .map((r) => {
      const replies = replyByParent.get(String(r.id)) ?? [];
      return {
        id: String(r.id),
        author: String(r.author ?? "Anonymous investor"),
        body: String(r.body ?? ""),
        ts: String(r.created_at ?? ""),
        answered: replies.some((x) => Boolean(x.verified)),
        replyCount: replies.length,
      };
    });
}

// Open (unanswered) questions for a ticker, newest first.
export async function listOpenQuestions(ticker: string): Promise<BoardQuestion[]> {
  const rows = await fetchBoard(ticker);
  return toQuestions(rows).filter((q) => !q.answered);
}

// Just the count — for the nav/home badge. This runs on EVERY /api/state hit
// (sidebar + dashboard), so it must be cheap: two id-only selects (question ids and
// verified-reply parent ids) instead of pulling 2000 full-body rows to count.
export async function countOpenQuestions(ticker: string): Promise<number> {
  const T = ticker.toUpperCase();
  const [{ data: questions }, { data: verifiedReplies }] = await Promise.all([
    svc().from("public_board").select("id").eq("ticker", T).eq("flag", "question").is("parent_id", null).limit(5000),
    svc().from("public_board").select("parent_id").eq("ticker", T).eq("verified", true).not("parent_id", "is", null).limit(5000),
  ]);
  const answered = new Set((verifiedReplies ?? []).map((r) => String(r.parent_id)));
  return (questions ?? []).filter((q) => !answered.has(String(q.id))).length;
}

// New activity since a timestamp — powers the digest email + realtime notifier.
export async function boardActivitySince(ticker: string, sinceIso: string): Promise<BoardActivity> {
  const rows = await fetchBoard(ticker);
  const since = new Date(sinceIso).getTime();
  const questions = toQuestions(rows);
  const newQuestions = questions.filter((q) => new Date(q.ts).getTime() > since);
  // New investor comments = non-question, non-company (unverified) posts since `since`.
  // Counts both top-level comments and replies; excludes the company's own verified replies.
  const newComments = rows.filter(
    (r) =>
      String(r.flag) !== "question" &&
      !r.verified &&
      new Date(String(r.created_at)).getTime() > since
  ).length;
  return {
    newQuestions,
    newComments,
    unansweredTotal: questions.filter((q) => !q.answered).length,
  };
}

// Post the company's VERIFIED reply to a board question. Used after an AI-drafted
// answer is approved (auto-post) or when the company replies manually. Returns the
// created reply post.
export async function postVerifiedReply(opts: {
  ticker: string;
  parentId: string;
  body: string;
  company: Company;
}) {
  const author = `${opts.company.name || opts.ticker} (Investor Relations)`;
  return addBoardPost({
    ticker: opts.ticker.toUpperCase(),
    author,
    body: opts.body.trim(),
    verified: true,
    flag: "verified",
    flagReason: "Official reply from the company's IR team.",
    parentId: opts.parentId,
    ts: new Date().toISOString(),
  });
}

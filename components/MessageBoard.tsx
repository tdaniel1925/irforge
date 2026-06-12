"use client";

import { useEffect, useMemo, useState } from "react";
import type { BoardPost, ReactionKind } from "@/lib/publicStats";

function ago(ts: string): string {
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Each signal type owns a color: a thick left rail, a badge, and a tint.
const FLAGS: Record<string, { label: string; rail: string; badge: string; tint: string }> = {
  verified: { label: "✓ Verified company", rail: "bg-emerald-500", badge: "bg-emerald-500 text-white", tint: "bg-emerald-500/[0.06]" },
  factual: { label: "Factual", rail: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300", tint: "" },
  opinion: { label: "Opinion", rail: "bg-sky-500", badge: "bg-sky-500/15 text-sky-600 dark:text-sky-300", tint: "" },
  hype: { label: "Hype", rail: "bg-amber-500", badge: "bg-amber-500/15 text-amber-600 dark:text-amber-300", tint: "bg-amber-500/[0.04]" },
  fud: { label: "Unverified / FUD", rail: "bg-orange-500", badge: "bg-orange-500/15 text-orange-600 dark:text-orange-300", tint: "bg-orange-500/[0.04]" },
  chatter: { label: "Chatter", rail: "bg-slate-400", badge: "bg-slate-500/15 text-faint", tint: "" },
};

const REACTIONS: { key: ReactionKind; icon: string; label: string }[] = [
  { key: "agree", icon: "👍", label: "Agree" },
  { key: "source", icon: "📊", label: "Cite a source" },
  { key: "question", icon: "🤔", label: "Question" },
  { key: "report", icon: "🚩", label: "Report" },
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "signal", label: "Signal only" },
  { key: "factual", label: "Factual" },
  { key: "opinion", label: "Opinion" },
];
type Sort = "top" | "new" | "factual";

export default function MessageBoard({ ticker }: { ticker: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("top");

  const load = async () => {
    try {
      const res = await fetch(`/api/board?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const post = async (text: string, parentId?: string, who?: string) => {
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, author: who ?? author, body: text, parentId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't post.");
    await load();
  };

  const react = async (postId: string, kind: ReactionKind) => {
    await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ react: kind, postId }) });
    await load();
  };

  const submitTop = async () => {
    setBusy(true); setError("");
    try { await post(body); setBody(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  };

  const flagOf = (p: BoardPost) => (p.verified ? "verified" : p.flag || "chatter");
  const score = (p: BoardPost) => (p.reactions?.agree ?? 0) * 2 + (p.reactions?.source ?? 0) * 3 + (p.reactions?.question ?? 0);

  // Company posts pinned (top, capped); community feed below, sorted & filtered.
  const roots = posts.filter((p) => !p.parentId);
  const repliesByParent = useMemo(() => {
    const m: Record<string, BoardPost[]> = {};
    for (const p of posts) if (p.parentId) (m[p.parentId] ??= []).push(p);
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.ts.localeCompare(b.ts));
    return m;
  }, [posts]);

  const companyPinned = roots.filter((p) => p.verified).slice(0, 2);
  let community = roots.filter((p) => !p.verified);
  community = community.filter((p) => {
    const f = flagOf(p);
    if (filter === "all") return true;
    if (filter === "signal") return f === "factual" || f === "opinion";
    return f === filter;
  });
  community.sort((a, b) =>
    sort === "new" ? b.ts.localeCompare(a.ts)
    : sort === "factual" ? (flagOf(b) === "factual" ? 1 : 0) - (flagOf(a) === "factual" ? 1 : 0) || b.ts.localeCompare(a.ts)
    : score(b) - score(a) || b.ts.localeCompare(a.ts)
  );

  return (
    <div>
      {/* Composer */}
      <div className="mb-5 rounded-xl border border-app bg-surface p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Name or handle"
            className="rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none sm:w-44" />
          <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitTop()}
            placeholder={`Share something about $${ticker}…`}
            className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <button onClick={submitTop} disabled={busy} className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50">
            {busy ? "…" : "Post"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-amber-500">{error}</p>}
        <p className="mt-2 text-[11px] text-faint">🛡 Every post is AI-labeled by signal quality — you filter what you see. Only threats and coordinated manipulation are removed.</p>
      </div>

      {/* Zone 1 — pinned company voice */}
      {companyPinned.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            📌 FROM THE COMPANY
          </p>
          <div className="space-y-3">
            {companyPinned.map((p) => (
              <PostCard key={p.id} post={p} flagOf={flagOf} replies={repliesByParent[p.id] ?? []} onReact={react} onReply={post} repliesByParent={repliesByParent} />
            ))}
          </div>
        </div>
      )}

      {/* Zone 2 — community feed */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${filter === f.key ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300" : "border-app text-muted hover:text-app"}`}>
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="text-faint">Sort:</span>
          {(["top", "new", "factual"] as Sort[]).map((s) => (
            <button key={s} onClick={() => setSort(s)} className={`rounded px-2 py-1 capitalize transition ${sort === s ? "font-semibold text-app" : "text-faint hover:text-muted"}`}>{s}</button>
          ))}
        </div>
      </div>

      {community.length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">{roots.length <= companyPinned.length ? "No community posts yet — start the conversation." : "Nothing matches this filter."}</p>
      ) : (
        <div className="space-y-3">
          {community.map((p) => (
            <PostCard key={p.id} post={p} flagOf={flagOf} replies={repliesByParent[p.id] ?? []} onReact={react} onReply={post} repliesByParent={repliesByParent} />
          ))}
        </div>
      )}
    </div>
  );
}

function PostCard({
  post, flagOf, replies, onReact, onReply, repliesByParent, depth = 0,
}: {
  post: BoardPost;
  flagOf: (p: BoardPost) => string;
  replies: BoardPost[];
  onReact: (id: string, k: ReactionKind) => void;
  onReply: (text: string, parentId?: string, who?: string) => Promise<void>;
  repliesByParent: Record<string, BoardPost[]>;
  depth?: number;
}) {
  const f = flagOf(post);
  const s = FLAGS[f] ?? FLAGS.chatter;
  const [showWhy, setShowWhy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyWho, setReplyWho] = useState("");
  const [replyErr, setReplyErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sendReply = async () => {
    setBusy(true); setReplyErr("");
    try { await onReply(replyText, post.id, replyWho); setReplyText(""); setReplying(false); }
    catch (e) { setReplyErr(e instanceof Error ? e.message : "Failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-app ${s.tint || "bg-surface"}`}>
      <div className="flex">
        {/* prominent color rail */}
        <div className={`w-1.5 shrink-0 ${s.rail}`} />
        <div className="min-w-0 flex-1 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-app">{post.author}</span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}>{s.label}</span>
            <span className="text-faint">{ago(post.ts)} ago</span>
          </div>
          <p className="text-sm leading-relaxed text-app">{post.body}</p>

          {/* click-to-expand reason (not a mouseover) */}
          {post.flagReason && !post.verified && (
            <div className="mt-2">
              <button onClick={() => setShowWhy((v) => !v)} className="text-[11px] font-medium text-muted underline-offset-2 hover:underline">
                {showWhy ? "Hide" : "Why this label?"}
              </button>
              {showWhy && (
                <p className="mt-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-[12px] italic text-muted">
                  {post.flagReason}
                </p>
              )}
            </div>
          )}

          {/* reactions + reply */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {REACTIONS.map((r) => {
              const n = post.reactions?.[r.key] ?? 0;
              return (
                <button key={r.key} onClick={() => onReact(post.id, r.key)} title={r.label}
                  className={`flex items-center gap-1 rounded-full border border-app px-2.5 py-1 text-xs transition hover:bg-app-hover ${n > 0 ? "text-app" : "text-faint"}`}>
                  <span>{r.icon}</span>{n > 0 && <span className="font-medium">{n}</span>}
                </button>
              );
            })}
            {depth < 2 && (
              <button onClick={() => setReplying((v) => !v)} className="ml-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted hover:text-app">
                ↩ Reply
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={replyWho} onChange={(e) => setReplyWho(e.target.value)} placeholder="You"
                className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none sm:w-32" />
              <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Write a reply…"
                className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
              <button onClick={sendReply} disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">Reply</button>
            </div>
          )}
          {replyErr && <p className="mt-1 text-xs text-amber-500">{replyErr}</p>}

          {/* nested replies */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-2 border-l-2 border-app pl-3">
              {replies.map((r) => (
                <PostCard key={r.id} post={r} flagOf={flagOf} replies={repliesByParent[r.id] ?? []} onReact={onReact} onReply={onReply} repliesByParent={repliesByParent} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

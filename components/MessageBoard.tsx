"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardPost, ReactionKind } from "@/lib/publicStats";
import ManipulationRadar from "@/components/ManipulationRadar";

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
  chatter: { label: "Chatter", rail: "bg-app-hover", badge: "bg-app-hover text-faint", tint: "" },
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
  { key: "questions", label: "❓ Questions" },
  { key: "answered", label: "✓ Company answered" },
  { key: "nofud", label: "🚫 Hide FUD" },
];
type Sort = "top" | "new" | "factual";

// ---- Voice dictation (Web Speech API) ----
// Lets users speak a post instead of typing. Browser-native, no backend; the
// transcript still goes through the same AI moderation as a typed post.
type SpeechRec = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { [i: number]: { isFinal: boolean } } }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};
function getSpeech(): SpeechRec | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec })
    .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRec }).webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = false;
  r.interimResults = true;
  r.lang = "en-US";
  return r;
}

function MicButton({ onText }: { onText: (append: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<SpeechRec | null>(null);

  useEffect(() => {
    setSupported(getSpeech() !== null);
    return () => recRef.current?.abort();
  }, []);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = getSpeech();
    if (!rec) {
      setSupported(false);
      return;
    }
    recRef.current = rec;
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const seg = e.results[i] as ArrayLike<{ transcript: string }> & { isFinal: boolean };
        const t = seg[0]?.transcript ?? "";
        if (seg.isFinal) finalText += t + " ";
        else interim += t;
      }
      onText((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };

  if (!supported) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      title={listening ? "Stop dictation" : "Speak your post"}
      aria-label={listening ? "Stop dictation" : "Speak your post"}
      className={`flex shrink-0 items-center justify-center rounded-lg border px-3 py-2.5 text-sm transition ${
        listening
          ? "animate-pulse border-red-500/50 bg-red-500/15 text-red-500"
          : "border-app text-muted hover:bg-app-hover hover:text-app"
      }`}
    >
      {listening ? "● Rec" : "🎤"}
    </button>
  );
}

export default function MessageBoard({ ticker }: { ticker: string }) {
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsProfile, setNeedsProfile] = useState(false);
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("top");
  const [search, setSearch] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // null = unknown (checking), false = guest, true = signed-in member
  // Who's viewing? Investors (members) get the composer; companies are pointed at
  // their dashboard (they answer with verified replies, not investor posts); guests
  // get sign-in/sign-up. A plain "signed in?" boolean showed company accounts an
  // investor composer that could only ever 401.
  const [viewer, setViewer] = useState<"member" | "company" | "guest" | null>(null);
  const [reactNudge, setReactNudge] = useState(false);

  // Reload from the start (page 0) — used on mount and after posting/reacting.
  const load = async () => {
    try {
      const res = await fetch(`/api/board?ticker=${encodeURIComponent(ticker)}&offset=0`, { cache: "no-store" });
      const data = await res.json();
      setPosts(data.posts ?? []);
      setOffset(data.pageSize ?? 15);
      setHasMore(Boolean(data.hasMore));
    } catch {
      /* ignore */
    }
  };

  // Append the next page of root threads.
  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/board?ticker=${encodeURIComponent(ticker)}&offset=${offset}`, { cache: "no-store" });
      const data = await res.json();
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(data.posts ?? []).filter((p: BoardPost) => !seen.has(p.id))];
      });
      setOffset(offset + (data.pageSize ?? 15));
      setHasMore(Boolean(data.hasMore));
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  // Detect who is viewing: investor (member), company account, or guest.
  useEffect(() => {
    let cancelled = false;
    import("@/lib/supabase/client").then(({ createClient, supabaseConfigured }) => {
      if (!supabaseConfigured()) { if (!cancelled) setViewer("guest"); return; }
      createClient().auth.getUser().then(({ data }) => {
        if (cancelled) return;
        if (!data.user) { setViewer("guest"); return; }
        setViewer(data.user.user_metadata?.account_type === "member" ? "member" : "company");
      }).catch(() => { if (!cancelled) setViewer("guest"); });
    });
    return () => { cancelled = true; };
  }, []);

  const post = async (text: string, parentId?: string) => {
    const res = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker, body: text, parentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      // Signed in but no username chosen yet — point at the profile page instead of
      // leaving them stuck on a bare error.
      if (data.needsProfile) setNeedsProfile(true);
      // Not an investor account (guest or company hitting Reply) — show the nudge
      // with real sign-in/sign-up links instead of a dead-end error string.
      if (data.needsAuth) {
        setReactNudge(true);
        setTimeout(() => setReactNudge(false), 8000);
      }
      throw new Error(data.error ?? "Couldn't post.");
    }
    setNeedsProfile(false);
    await load();
  };

  const react = async (postId: string, kind: ReactionKind) => {
    try {
      const res = await fetch("/api/board", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ react: kind, postId }) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.needsAuth) {
          // Guest clicked a reaction — nudge with a real path to sign up, not a dead end.
          setReactNudge(true);
          setTimeout(() => setReactNudge(false), 8000);
          return;
        }
        setError(data.error ?? (res.status === 429 ? "You're reacting too fast — try again in a moment." : "Couldn't save that reaction."));
        setTimeout(() => setError(""), 4000);
        return;
      }
      await load();
    } catch {
      setError("Network error — couldn't save that reaction.");
      setTimeout(() => setError(""), 4000);
    }
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
  const hasVerifiedReply = (id: string) => (repliesByParent[id] ?? []).some((r) => r.verified);
  const q = search.trim().toLowerCase();
  let community = roots.filter((p) => !p.verified);
  community = community.filter((p) => {
    const f = flagOf(p);
    // category / signal filter
    const passCat =
      filter === "all" ? true
      : filter === "signal" ? f === "factual" || f === "opinion"
      : filter === "questions" ? p.body.includes("?") || (p.reactions?.question ?? 0) > 0
      : filter === "answered" ? hasVerifiedReply(p.id)
      : filter === "nofud" ? f !== "fud" && f !== "hype"
      : f === filter;
    if (!passCat) return false;
    // author filter (click a name)
    if (authorFilter && p.author.toLowerCase() !== authorFilter.toLowerCase()) return false;
    // keyword search across body + author
    if (q && !(p.body.toLowerCase().includes(q) || p.author.toLowerCase().includes(q))) return false;
    return true;
  });
  community.sort((a, b) =>
    sort === "new" ? b.ts.localeCompare(a.ts)
    : sort === "factual" ? (flagOf(b) === "factual" ? 1 : 0) - (flagOf(a) === "factual" ? 1 : 0) || b.ts.localeCompare(a.ts)
    : score(b) - score(a) || b.ts.localeCompare(a.ts)
  );

  return (
    <div>
      {/* Response-time expectations — companies are notified of every question, but
          they answer on their own schedule. Set that expectation up front. */}
      <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.06] px-4 py-3">
        <span aria-hidden className="mt-0.5 text-sm">🔔</span>
        <p className="text-xs leading-relaxed text-sky-700 dark:text-sky-300">
          <span className="font-semibold">Companies on PubcoZone are notified directly the moment investors post questions or comments here.</span>{" "}
          When they respond, answers arrive verified and on the record. Response times vary by company — some reply within hours,
          others take longer, and not every question will receive a reply.
        </p>
      </div>
      {/* Manipulation radar — neutral caution about board posting patterns + public volume. */}
      <ManipulationRadar ticker={ticker} />
      {/* Transient action error (e.g. a rejected reaction) — visible regardless of auth/composer. */}
      {error && viewer !== "member" && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-600 dark:text-amber-400">{error}</p>
      )}
      {/* Guest tapped a reaction — one inline nudge with a real path to sign up. */}
      {reactNudge && (
        <p className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-2 text-xs text-sky-700 dark:text-sky-300">
          Reactions take a free investor account (one per person — that&apos;s what keeps the counts honest).{" "}
          <a href={`/login?type=investor&mode=signup&next=/t/${ticker}`} className="font-semibold underline">Create one in a minute</a>
          {" "}or{" "}
          <a href={`/login?next=/t/${ticker}`} className="font-semibold underline">sign in</a>.
        </p>
      )}
      {/* Composer — investors only. Companies answer from their dashboard; guests
          get a sign-in/sign-up CTA that actually links to sign-up. */}
      {viewer === "member" ? (
        <div className="mb-5 rounded-xl border border-app bg-surface p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitTop()}
              placeholder={`Share something about $${ticker}…  (or tap 🎤 to speak)`}
              className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
            <MicButton onText={(t) => setBody(t)} />
            <button onClick={submitTop} disabled={busy} className="rounded-lg bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-50">
              {busy ? "…" : "Post"}
            </button>
          </div>
          {error && (
            <p className="mt-2 text-xs text-amber-500">
              {error}
              {needsProfile && (
                <> <a href="/member/profile" className="font-medium underline">Set your investor username</a> to start posting.</>
              )}
            </p>
          )}
          <p className="mt-2 text-[11px] text-faint">🛡 Posts are AI-labeled by signal quality — you filter what you see. 🎤 voice posts are transcribed in your browser and moderated the same way. You post under your investor profile. Only threats and coordinated manipulation are removed.</p>
        </div>
      ) : viewer === "company" ? (
        <div className="mb-5 rounded-xl border border-app bg-surface px-4 py-3">
          <p className="text-xs text-muted">
            You&apos;re signed in as a <span className="font-semibold text-app">company account</span> — this composer is for investors.
            Answer investor questions with verified, on-the-record replies from your{" "}
            <a href="/app" className="font-semibold text-emerald-600 underline-offset-2 hover:underline dark:text-emerald-400">dashboard →</a>
          </p>
        </div>
      ) : (
        <div className="mb-5 rounded-xl border border-app bg-surface p-6 text-center">
          <p className="text-sm font-semibold text-app">Join the conversation on ${ticker}</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Posting on PubcoZone takes a free investor account — that&apos;s how we keep it real names over anonymous pump-and-dump.
          </p>
          <div className="mt-3 flex justify-center gap-2">
            <a href={`/login?type=investor&mode=signup&next=/t/${ticker}`} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">Create free account</a>
            <a href={`/login?next=/t/${ticker}`} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app transition hover:bg-app-hover">Sign in</a>
          </div>
        </div>
      )}

      {/* Zone 1 — pinned company voice */}
      {companyPinned.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            📌 FROM THE COMPANY
          </p>
          <div className="space-y-3">
            {companyPinned.map((p) => (
              <PostCard key={p.id} post={p} flagOf={flagOf} replies={repliesByParent[p.id] ?? []} onReact={react} onReply={post} repliesByParent={repliesByParent} onAuthorClick={setAuthorFilter} />
            ))}
          </div>
        </div>
      )}

      {/* Zone 2 — community feed */}
      {/* search + active author chip */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search this board…"
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-app" aria-label="Clear search">✕</button>
          )}
        </div>
        {authorFilter && (
          <button
            onClick={() => setAuthorFilter(null)}
            className="flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300"
          >
            Showing @{authorFilter} <span className="text-faint">✕</span>
          </button>
        )}
      </div>
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
            <PostCard key={p.id} post={p} flagOf={flagOf} replies={repliesByParent[p.id] ?? []} onReact={react} onReply={post} repliesByParent={repliesByParent} onAuthorClick={setAuthorFilter} />
          ))}
        </div>
      )}

      {hasMore && (
        <div className="mt-5 text-center">
          <button onClick={loadMore} disabled={loadingMore} className="rounded-lg border border-app px-5 py-2.5 text-sm font-medium text-muted transition hover:bg-app-hover hover:text-app disabled:opacity-50">
            {loadingMore ? "Loading…" : "Load more posts"}
          </button>
        </div>
      )}
    </div>
  );
}

function PostCard({
  post, flagOf, replies, onReact, onReply, repliesByParent, onAuthorClick, depth = 0,
}: {
  post: BoardPost;
  flagOf: (p: BoardPost) => string;
  replies: BoardPost[];
  onReact: (id: string, k: ReactionKind) => void;
  onReply: (text: string, parentId?: string) => Promise<void>;
  repliesByParent: Record<string, BoardPost[]>;
  onAuthorClick?: (author: string) => void;
  depth?: number;
}) {
  const f = flagOf(post);
  const s = FLAGS[f] ?? FLAGS.chatter;
  const [showWhy, setShowWhy] = useState(false);
  const [replying, setReplying] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyErr, setReplyErr] = useState("");
  const [busy, setBusy] = useState(false);

  const sendReply = async () => {
    setBusy(true); setReplyErr("");
    try { await onReply(replyText, post.id); setReplyText(""); setReplying(false); }
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
            {post.authorAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.authorAvatar} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : post.memberId ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-[9px] font-bold text-emerald-600 dark:text-emerald-300">
                {(post.author || "?").charAt(0).toUpperCase()}
              </span>
            ) : null}
            {onAuthorClick && !post.verified ? (
              <button onClick={() => onAuthorClick(post.author)} className="font-semibold text-app hover:text-emerald-500 hover:underline" title={`See only ${post.author}'s posts`}>
                {post.memberId ? `@${post.author}` : post.author}
              </button>
            ) : (
              <span className="font-semibold text-app">{post.memberId ? `@${post.author}` : post.author}</span>
            )}
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.badge}`}>{s.label}</span>
            {/* Answered signal: a question with a verified company reply shows investors
                the company responded on the record. */}
            {post.flag === "question" && replies.some((r) => r.verified) && (
              <span className="rounded-md bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">✓ Answered</span>
            )}
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

          {/* FEATURE-1: truth-check the board — reality-check vs filings.
              Only on factual posts so it never collides with feature-2's
              manipulation banner (which renders above the composer, not here). */}
          {f === "factual" && <TruthCheck ticker={post.ticker} post={post} />}

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
              <input value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Write a reply…" autoFocus
                className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
              <button onClick={sendReply} disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-50">Reply</button>
            </div>
          )}
          {replyErr && <p className="mt-1 text-xs text-amber-500">{replyErr}</p>}

          {/* nested replies */}
          {replies.length > 0 && (
            <div className="mt-3 space-y-2 border-l-2 border-app pl-3">
              {replies.map((r) => (
                <PostCard key={r.id} post={r} flagOf={flagOf} replies={repliesByParent[r.id] ?? []} onReact={onReact} onReply={onReply} repliesByParent={repliesByParent} onAuthorClick={onAuthorClick} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// FEATURE-1: truth-check the board
// Self-contained child of PostCard. Lazily reality-checks a factual post
// against the live public record (EDGAR/FINRA/XBRL) on button click.
// COMPLIANCE: public record only — never advice, never rates the buy/sell
// merit; "unverifiable" = the filings are silent, NOT that the poster lies.
// ===================================================================
type TruthCitation = { label: string; url?: string };
type TruthResult = {
  checkable: boolean;
  verdict: "supported" | "contradicted" | "unverifiable";
  claim: string;
  reality: string;
  citations: TruthCitation[];
  engine: "claude" | "template";
};

const VERDICT_STYLE: Record<TruthResult["verdict"], { label: string; cls: string }> = {
  supported: { label: "Public record agrees", cls: "border-emerald-500/40 bg-emerald-500/[0.06] text-emerald-600 dark:text-emerald-300" },
  contradicted: { label: "Public record shows otherwise", cls: "border-orange-500/40 bg-orange-500/[0.06] text-orange-600 dark:text-orange-300" },
  unverifiable: { label: "Filings neither confirm nor deny", cls: "border-app bg-surface-2 text-muted" },
};

function TruthCheck({ ticker, post }: { ticker: string; post: BoardPost }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [quotaHit, setQuotaHit] = useState(false);
  const [result, setResult] = useState<TruthResult | null>(null);

  const run = async () => {
    // Toggle closed if we already have a result.
    if (result || open) { setOpen((v) => !v); return; }
    setBusy(true); setErr(""); setQuotaHit(false);
    try {
      const res = await fetch("/api/board/truth-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, body: post.body }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsUpgrade) setQuotaHit(true);
        throw new Error(data.error ?? "Couldn't run the reality-check.");
      }
      setResult(data.result as TruthResult);
      setOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't run the reality-check.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <button
        onClick={run}
        disabled={busy}
        className="text-[11px] font-medium text-emerald-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-emerald-400"
      >
        {busy ? "Checking the public record…" : open ? "Hide reality-check" : "🔎 Reality-check vs filings"}
      </button>

      {err && (
        <p className="mt-1 text-[11px] text-amber-500">
          {err}
          {quotaHit && <> <a href="/member/billing" className="font-semibold underline">Go unlimited with Investor+ →</a></>}
        </p>
      )}

      {open && result && (
        <div className="mt-2 rounded-lg border border-app bg-surface-2 p-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-faint">
            PubcoZone reality-check — public record only
          </p>

          {result.checkable ? (
            <>
              <span className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${VERDICT_STYLE[result.verdict].cls}`}>
                {VERDICT_STYLE[result.verdict].label}
              </span>
              {result.claim && (
                <p className="mt-2 text-[12px] text-muted">
                  <span className="font-semibold text-app">Claim checked:</span> {result.claim}
                </p>
              )}
              {result.reality && (
                <p className="mt-1 text-[12px] leading-relaxed text-app">{result.reality}</p>
              )}
              {result.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-faint">Sources:</span>
                  {result.citations.map((c, i) =>
                    c.url ? (
                      <a
                        key={i}
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full border border-app px-2 py-0.5 text-[10px] font-medium text-muted transition hover:bg-app-hover hover:text-app"
                      >
                        {c.label} ↗
                      </a>
                    ) : (
                      <span key={i} className="rounded-full border border-app px-2 py-0.5 text-[10px] font-medium text-faint">
                        {c.label}
                      </span>
                    )
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-[12px] italic text-muted">
              No checkable factual claim here — nothing in this post maps to a figure in the public record.
            </p>
          )}

          <p className="mt-2 text-[10px] text-faint">
            Facts from the public record only — not investment advice. {result.engine === "template" ? "(offline fallback)" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

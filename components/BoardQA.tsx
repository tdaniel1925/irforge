"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

// Investor Q&A inbox — the company-facing side of its public board. Lists open
// (unanswered) investor questions, drafts a compliance-checked answer with AI, lets
// the company edit it, then posts it as a VERIFIED company reply on the board.
// Flow: draft -> review/edit -> Approve & post (compliance re-checked server-side).
// Inline-only (no popups/toasts).

interface Question {
  id: string;
  author: string;
  body: string;
  ts: string;
  replyCount: number;
}
interface Flag { rule: string; severity: string }

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function BoardQA({ ticker }: { ticker: string }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [err, setErr] = useState("");
  const [liveNote, setLiveNote] = useState(false); // flashes when a new question arrives live
  // per-question working state
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Record<string, Flag[]>>({});
  const [busy, setBusy] = useState<Record<string, "draft" | "post" | null>>({});
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  // "Also post to X" — remembered as a default across answers (localStorage).
  const [alsoX, setAlsoX] = useState(false);
  useEffect(() => { try { setAlsoX(localStorage.getItem("boardqa_also_x") === "1"); } catch { /* ignore */ } }, []);
  const toggleAlsoX = (v: boolean) => { setAlsoX(v); try { localStorage.setItem("boardqa_also_x", v ? "1" : "0"); } catch { /* ignore */ } };

  const load = async () => {
    try {
      const r = await fetch("/api/board/questions", { cache: "no-store" });
      if (!r.ok) { setErr("Couldn't load investor questions."); return; }
      const d = await r.json();
      setQuestions(Array.isArray(d.questions) ? d.questions : []);
      // Clear any prior error — load() re-runs on every realtime insert, and a sticky
      // error was permanently replacing the (still-working) list with the banner.
      setErr("");
    } catch {
      setErr("Couldn't reach the board.");
    }
  };
  useEffect(() => { load(); }, []);

  // Realtime: when a new post lands on THIS ticker's board, reload — so a fresh
  // question appears without a manual refresh. A new question flashes a "new" note.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!ticker || !supabaseConfigured()) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`board-qa:${ticker}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "public_board", filter: `ticker=eq.${ticker.toUpperCase()}` },
        (payload) => {
          if ((payload.new as { flag?: string })?.flag === "question") {
            setLiveNote(true);
            setTimeout(() => setLiveNote(false), 6000);
          }
          void loadRef.current();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [ticker]);

  const setBusyFor = (id: string, v: "draft" | "post" | null) => setBusy((b) => ({ ...b, [id]: v }));

  const draftAnswer = async (id: string) => {
    setBusyFor(id, "draft"); setNoteById((n) => ({ ...n, [id]: "" }));
    try {
      const r = await fetch("/api/board/questions/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: id }) });
      const d = await r.json();
      if (!r.ok) { setNoteById((n) => ({ ...n, [id]: d.error ?? "Couldn't draft an answer." })); return; }
      setDrafts((s) => ({ ...s, [id]: d.draft }));
      setFlags((s) => ({ ...s, [id]: d.flags ?? [] }));
      if (d.deflected) setNoteById((n) => ({ ...n, [id]: "This asks for non-public info — the draft is a safe, compliant deflection. Review before posting." }));
    } catch {
      setNoteById((n) => ({ ...n, [id]: "Couldn't reach the AI. Try again." }));
    } finally {
      setBusyFor(id, null);
    }
  };

  const post = async (id: string) => {
    const body = (drafts[id] ?? "").trim();
    if (!body) return;
    setBusyFor(id, "post"); setNoteById((n) => ({ ...n, [id]: "" }));
    try {
      const r = await fetch("/api/board/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questionId: id, body, alsoPostToX: alsoX }) });
      const d = await r.json();
      if (!r.ok) { setNoteById((n) => ({ ...n, [id]: d.error ?? "Couldn't post the reply." })); setBusyFor(id, null); return; }
      // If X was requested but a gate held it, surface why (the board reply still posted).
      if (d.x?.attempted && !d.x?.posted && d.x?.skipped) {
        setNoteById((n) => ({ ...n, [`x_${id}`]: d.x.skipped }));
      }
      // Answered — drop it from the open list (small delay so an X note is readable).
      // Deliberately DO NOT clear busy on success: the reply is posted, and clearing
      // it re-enabled "Approve & post" during the 4s note window — a second click
      // posted a duplicate verified reply.
      const drop = () => setQuestions((qs) => (qs ?? []).filter((q) => q.id !== id));
      if (d.x?.attempted && !d.x?.posted) setTimeout(drop, 4000); else drop();
    } catch {
      setNoteById((n) => ({ ...n, [id]: "Couldn't post — try again." }));
      setBusyFor(id, null);
    }
  };

  const blocking = (id: string) => (flags[id] ?? []).some((f) => f.severity === "block");

  if (err) return <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{err}</p>;
  if (questions === null) return <p className="text-sm text-faint">Loading investor questions…</p>;

  if (questions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-faint">
        No open investor questions right now. When someone asks a question on your public board, it&apos;ll show up here to answer.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {liveNote && (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          🟢 New investor question just came in.
        </p>
      )}
      {questions.map((q) => {
        const draft = drafts[q.id];
        const b = busy[q.id];
        return (
          <div key={q.id} className="rounded-xl border border-app bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-app">{q.body}</p>
                <p className="mt-1 text-[11px] text-faint">{q.author} · {timeAgo(q.ts)}{q.replyCount > 0 ? ` · ${q.replyCount} repl${q.replyCount === 1 ? "y" : "ies"}` : ""}</p>
              </div>
              {draft === undefined && (
                <button onClick={() => draftAnswer(q.id)} disabled={b === "draft"} className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-3 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-300">
                  {b === "draft" ? "Drafting…" : "✨ Draft answer"}
                </button>
              )}
            </div>

            {draft !== undefined && (
              <div className="mt-3 border-t border-app pt-3">
                <label className="mb-1 block text-[11px] font-medium text-muted">Your verified reply (edit before posting)</label>
                <textarea
                  value={draft}
                  onChange={(e) => setDrafts((s) => ({ ...s, [q.id]: e.target.value }))}
                  rows={4}
                  spellCheck
                  className="w-full resize-y rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
                />
                {(flags[q.id]?.length ?? 0) > 0 && (
                  <p className={`mt-1.5 text-[11px] ${blocking(q.id) ? "text-red-600 dark:text-red-300" : "text-amber-600 dark:text-amber-300"}`}>
                    {blocking(q.id) ? "⚠ Blocked language — fix before posting: " : "Heads up: "}{(flags[q.id] ?? []).map((f) => f.rule).join(", ")}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button onClick={() => post(q.id)} disabled={b === "post" || blocking(q.id) || !draft.trim()} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                    {b === "post" ? "Posting…" : alsoX ? "✓ Approve & post (board + X)" : "✓ Approve & post reply"}
                  </button>
                  <button onClick={() => draftAnswer(q.id)} disabled={b === "draft"} className="rounded-lg border border-app px-3 py-1.5 text-xs font-medium text-app transition hover:bg-app-hover disabled:opacity-50">
                    {b === "draft" ? "…" : "↻ Re-draft"}
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-muted" title="Also share this answer on X automatically. Only routine (Reg FD green) answers auto-post; anything sensitive (yellow) or material (red) stays on the board for a human. Disclosure + 280-char fit applied.">
                    <input type="checkbox" checked={alsoX} onChange={(e) => toggleAlsoX(e.target.checked)} className="h-3.5 w-3.5" />
                    Also post to X (𝕏)
                  </label>
                </div>
                <p className="mt-1 text-[11px] text-faint">Posts publicly as a verified reply from your IR team. FLS/disclosures apply. {alsoX ? "Only routine (Reg FD green) answers auto-tweet — anything sensitive (yellow) or material (red) stays on the board for a human to share." : ""}</p>
                {noteById[`x_${q.id}`] && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-300">𝕏 {noteById[`x_${q.id}`]}</p>}
              </div>
            )}
            {noteById[q.id] && <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">{noteById[q.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}

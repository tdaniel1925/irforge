"use client";

import Link from "next/link";
import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, FlagList, LoadingState, Thread, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Draft } from "@/lib/types";

// HOME = the approval inbox. The one job a company has: look at what we want to
// post, and approve / edit / reject it. Everything is written in plain words.

export default function ApprovalInbox() {
  const { db, error, busy, act } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  // A company that signed up but hasn't completed onboarding has no ticker yet —
  // send them to finish setup instead of showing an empty, nameless inbox.
  if (!db.company.ticker?.trim()) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-semibold text-app">Let&apos;s finish setting up</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Your account is ready — connect your ticker and we&apos;ll pull your public profile and draft your first posts. Takes about a minute.
        </p>
        <Link href="/onboarding" className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500">
          Finish setup →
        </Link>
      </div>
    );
  }

  // The things that need a decision, newest first. Blocked items show too (need fixing).
  const inbox = db.drafts.filter((d) => d.status === "pending" || d.status === "blocked");
  const readyToSend = db.drafts.filter((d) => d.status === "approved");

  const run = async (id: string, action: string, success: string, body?: object) => {
    setNotice(null);
    const err = await act(`/api/drafts/${id}`, "PATCH", { action, ...body });
    setNotice(err ? { text: err, tone: "error" } : { text: success, tone: "success" });
  };

  const approveAll = async () => {
    setNotice(null);
    const ok = inbox.filter((d) => d.status === "pending");
    for (const d of ok) {
      const err = await act(`/api/drafts/${d.id}`, "PATCH", { action: "approve" });
      if (err) { setNotice({ text: err, tone: "error" }); return; }
    }
    setNotice({ text: `Approved all ${ok.length}. They'll go out on X (with your legal disclosures added automatically).`, tone: "success" });
  };

  const startEdit = (d: Draft) => { setEditing(d.id); setEditText(d.tweets.join("\n\n")); };
  const saveEdit = async (id: string) => {
    await run(id, "edit", "Saved. We re-checked it for risky wording.", { tweets: editText.split(/\n\s*\n/) });
    setEditing(null);
  };

  const sendNow = async (d: Draft) => {
    await run(d.id, "publish", db.hasAyrshare ? "Posted to X. Done." : "Posted (demo — connect X in Settings to post for real).");
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Plain-English header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-app">Your approvals</h1>
        <p className="mt-1 text-sm text-muted">
          This is everything we&apos;ve written for <span className="font-medium text-app">{db.company.name}</span> and want to post on X.
          Read each one and tap <span className="font-medium text-emerald-600 dark:text-emerald-400">Approve</span> to let it go out, <span className="font-medium text-app">Edit</span> to change the words, or <span className="font-medium text-app">Skip</span> to throw it away.
          {" "}Nothing posts until you say so.
        </p>
      </div>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      {db.company.quietMode && <Banner tone="info" message="Pause mode is ON — you can approve, but nothing will actually post until you turn it off in Settings." />}

      {/* The inbox */}
      {inbox.length === 0 && readyToSend.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-10 text-center">
            <p className="text-lg font-medium text-app">You&apos;re all caught up 🎉</p>
            <p className="mt-1 text-sm text-muted">Nothing needs your approval right now. When we write your next post, it&apos;ll show up here.</p>
          </div>
        </Card>
      ) : (
        <>
          {inbox.filter((d) => d.status === "pending").length > 1 && (
            <div className="mb-4 flex justify-end">
              <Button onClick={approveAll} disabled={busy}>✓ Approve all {inbox.filter((d) => d.status === "pending").length}</Button>
            </div>
          )}

          <div className="space-y-4">
            {inbox.map((d) => (
              <Card key={d.id} className={d.status === "blocked" ? "border-red-500/40" : ""}>
                {/* What kind of thing is this, in plain words */}
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {d.status === "blocked"
                    ? "⚠ Needs a fix before it can post"
                    : d.kind === "filing_thread" ? "📄 About your latest SEC filing"
                    : d.kind === "public_answer" ? "💬 An answer to an investor's question"
                    : d.kind === "reply" ? "💬 A reply to someone on X"
                    : d.title.startsWith("Rebuttal") ? "🛡 A response to a negative post"
                    : "📢 A post to keep your feed active"}
                </p>

                <p className="mb-1 text-sm font-medium text-app">We want to post this to X:</p>

                {editing === d.id ? (
                  <div>
                    <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={Math.max(5, editText.split("\n").length + 1)}
                      className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
                    <p className="mt-1 text-xs text-faint">Tip: leave a blank line between tweets to make a thread.</p>
                    <div className="mt-2 flex gap-2">
                      <Button onClick={() => saveEdit(d.id)} disabled={busy}>Save changes</Button>
                      <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <Thread tweets={d.tweets} handle={db.company.xHandle} />
                )}

                <FlagList flags={d.complianceFlags} />

                {/* Actions in plain words */}
                {editing !== d.id && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {d.status === "pending" && (
                      <>
                        <Button onClick={() => run(d.id, "approve", "Approved. It's queued to post — disclosures get added automatically.")} disabled={busy}>✓ Approve &amp; let it post</Button>
                        <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>✎ Edit the words</Button>
                        <Button variant="danger" onClick={() => run(d.id, "reject", "Skipped — it won't post.")} disabled={busy}>✕ Skip it</Button>
                      </>
                    )}
                    {d.status === "blocked" && (
                      <>
                        <span className="self-center text-xs text-red-500">This has wording that could be a compliance problem — edit it, then it can post.</span>
                        <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>✎ Fix the wording</Button>
                        <Button variant="danger" onClick={() => run(d.id, "reject", "Discarded.")} disabled={busy}>✕ Throw it away</Button>
                      </>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>

          {/* Approved-but-not-yet-posted */}
          {readyToSend.length > 0 && (
            <div className="mt-8">
              <h2 className="mb-1 text-sm font-semibold text-app">Approved — ready to go out</h2>
              <p className="mb-3 text-xs text-muted">You approved these. Tap to post them now, or they post on schedule.</p>
              <div className="space-y-3">
                {readyToSend.map((d) => (
                  <Card key={d.id} className="border-sky-500/30">
                    <p className="mb-2 text-sm text-app">{d.tweets[0]}</p>
                    <Button onClick={() => sendNow(d)} disabled={busy || db.company.quietMode} title={db.company.quietMode ? "Pause mode is on" : undefined}>
                      ↗ Post to X now
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Where to go for the other stuff */}
      <div className="mt-10 rounded-xl border border-app bg-surface p-4 text-sm">
        <p className="font-medium text-app">Looking for something else?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <Link href="/company" className="rounded-lg border border-app p-3 hover:bg-app-hover">
            <p className="font-medium text-app">🛡 Defense &amp; reach</p>
            <p className="text-xs text-muted">See threats and your visibility score</p>
          </Link>
          <Link href="/proof" className="rounded-lg border border-app p-3 hover:bg-app-hover">
            <p className="font-medium text-app">📊 Your results</p>
            <p className="text-xs text-muted">Numbers to show your board</p>
          </Link>
          <Link href="/settings" className="rounded-lg border border-app p-3 hover:bg-app-hover">
            <p className="font-medium text-app">⚙ Settings</p>
            <p className="text-xs text-muted">Company details, connect X</p>
          </Link>
        </div>
      </div>
    </div>
  );
}

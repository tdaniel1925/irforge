"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, FlagList, LoadingState, PageHeader, Thread, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Draft } from "@/lib/types";

// The Do queue: every action that raises the score, ranked, in one place.

export default function DoPage() {
  const { db, error, busy, act } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const blocked = db.drafts.filter((d) => d.status === "blocked");
  const pending = db.drafts.filter((d) => d.status === "pending");
  const approved = db.drafts.filter((d) => d.status === "approved");
  const questions = db.mentions.filter((m) => m.sentiment === "question" && !m.replyDraftId);
  const publicQs = db.publicQuestions.filter((q) => q.status === "open" && !q.answerDraftId && q.ticker === db.company.ticker.toUpperCase());
  const unusedFilings = db.filings.filter((f) => !f.draftId).slice(0, 3);
  const total = blocked.length + pending.length + approved.length + questions.length + publicQs.length + unusedFilings.length;

  const run = async (url: string, method: string, body?: unknown, success?: string) => {
    setNotice(null);
    const err = await act(url, method, body);
    setNotice(err ? { text: err, tone: "error" } : success ? { text: success, tone: "success" } : null);
  };

  const startEdit = (d: Draft) => {
    setEditing(d.id);
    setEditText(d.tweets.join("\n\n"));
    setExpanded(d.id);
  };

  const saveEdit = async (id: string) => {
    await run(`/api/drafts/${id}`, "PATCH", { action: "edit", tweets: editText.split(/\n\s*\n/) }, "Saved — compliance re-checked.");
    setEditing(null);
  };

  return (
    <div>
      <PageHeader
        title={total === 0 ? "All clear" : `${total} thing${total === 1 ? "" : "s"} need${total === 1 ? "s" : ""} you`}
        subtitle="Work the queue top to bottom — each item feeds your score. Most weeks this takes five minutes."
      >
        {db.company.quietMode && (
          <span className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300">
            ⏸ QUIET MODE — publishing suspended
          </span>
        )}
      </PageHeader>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {total === 0 && (
        <Card className="border-dashed">
          <p className="py-6 text-center text-sm text-muted">
            Queue&apos;s empty — you&apos;re done. New filings, questions, and drafts land here automatically.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {/* 1 — Blocked drafts: fix risky language */}
        {blocked.map((d) => (
          <QueueItem
            key={d.id}
            tone="red"
            kicker="FIX — blocked by compliance"
            title={d.title}
            meta={`drafted ${timeAgo(d.createdAt)}`}
            chip="unblocks: Your Engine"
            expanded={expanded === d.id}
            onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            actions={
              <>
                <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>Edit to fix</Button>
                <Button variant="danger" onClick={() => run(`/api/drafts/${d.id}`, "PATCH", { action: "reject" }, "Discarded.")} disabled={busy}>Discard</Button>
              </>
            }
          >
            <FlagList flags={d.complianceFlags} />
            {editing === d.id ? (
              <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(d.id)} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <Thread tweets={d.tweets} handle={db.company.xHandle} />
            )}
          </QueueItem>
        ))}

        {/* 2 — Pending drafts: approve */}
        {pending.map((d) => (
          <QueueItem
            key={d.id}
            tone="amber"
            kicker="APPROVE — ready for your sign-off"
            title={d.title}
            meta={`${d.tweets.length} tweet${d.tweets.length > 1 ? "s" : ""} · drafted ${timeAgo(d.createdAt)} via ${d.aiEngine}`}
            chip="feeds: Your Engine"
            expanded={expanded === d.id}
            onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            actions={
              <>
                <Button onClick={() => run(`/api/drafts/${d.id}`, "PATCH", { action: "approve" }, "Approved — it moves down the queue, ready to publish.")} disabled={busy}>✓ Approve</Button>
                <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>Edit</Button>
                <Button variant="danger" onClick={() => run(`/api/drafts/${d.id}`, "PATCH", { action: "reject" }, "Rejected — it won't post.")} disabled={busy}>Reject</Button>
              </>
            }
          >
            <FlagList flags={d.complianceFlags} />
            {editing === d.id ? (
              <EditBox value={editText} onChange={setEditText} onSave={() => saveEdit(d.id)} onCancel={() => setEditing(null)} busy={busy} />
            ) : (
              <Thread tweets={d.tweets} handle={db.company.xHandle} />
            )}
          </QueueItem>
        ))}

        {/* 3 — Approved drafts: publish */}
        {approved.map((d) => (
          <QueueItem
            key={d.id}
            tone="sky"
            kicker="PUBLISH — approved and waiting"
            title={d.title}
            meta={`approved by ${d.decidedBy ?? "you"} ${d.decidedAt ? timeAgo(d.decidedAt) : ""}`}
            chip="feeds: Conversation + Engine"
            expanded={expanded === d.id}
            onToggle={() => setExpanded(expanded === d.id ? null : d.id)}
            actions={
              <Button
                onClick={() => run(`/api/drafts/${d.id}`, "PATCH", { action: "publish" }, db.hasAyrshare ? "Published to X — disclosures appended." : "Published (simulated — no X connection yet).")}
                disabled={busy || db.company.quietMode}
                title={db.company.quietMode ? "Quiet mode is on" : db.hasAyrshare ? "Posts to your real X account" : undefined}
              >
                ↗ Publish to X
              </Button>
            }
          >
            <Thread tweets={d.tweets} handle={db.company.xHandle} />
            <p className="mt-2 text-xs text-faint">
              Disclosures are appended on publish — can&apos;t be skipped.
              {db.hasAyrshare && <span className="ml-1 text-amber-600 dark:text-amber-400/80">Publishing connected: this posts for real.</span>}
            </p>
          </QueueItem>
        ))}

        {/* 4 — Public page questions: the convene loop */}
        {publicQs.map((q) => (
          <QueueItem
            key={q.id}
            tone="emerald"
            kicker="ANSWER — investor question on your public page"
            title={`${q.author}: ${q.question}`}
            meta={`asked ${timeAgo(q.ts)} · answer publishes to your page + X simultaneously (Reg FD rail)`}
            chip="feeds: Sentiment + Trust"
            expanded={false}
            actions={
              <Button onClick={() => run(`/api/questions/${q.id}/draft`, "POST", undefined, "Answer drafted from your public record — approve it above.")} disabled={busy}>
                ✦ Draft answer
              </Button>
            }
          />
        ))}

        {/* 5 — X mentions */}
        {questions.map((m) => (
          <QueueItem
            key={m.id}
            tone="emerald"
            kicker="ANSWER — shareholder question"
            title={`${m.author}: ${m.text}`}
            meta={`asked ${timeAgo(m.ts)}${m.requiresNonPublicInfo ? " · ⚠ can't answer directly — we'll draft a safe deflection" : ""}`}
            chip="feeds: Sentiment"
            expanded={false}
            actions={
              <Button onClick={() => run(`/api/mentions/${m.id}/reply`, "POST", undefined, "Reply drafted — it'll appear above as a draft to approve.")} disabled={busy}>
                ✦ Draft answer
              </Button>
            }
          />
        ))}

        {/* 5 — Unused filings */}
        {unusedFilings.map((f) => (
          <QueueItem
            key={f.id}
            tone="slate"
            kicker="USE — news you haven't told anyone about"
            title={`${f.form}: ${f.title}`}
            meta={`filed ${timeAgo(f.filedAt)} · ${f.source === "edgar" ? "live EDGAR" : "demo"}`}
            chip="feeds: Conversation + Media"
            expanded={false}
            actions={
              <Button onClick={() => run(`/api/filings/${f.id}/generate`, "POST", undefined, "Post drafted — it'll appear above for your approval.")} disabled={busy}>
                ✦ Turn into a post
              </Button>
            }
          />
        ))}
      </div>
    </div>
  );
}

const TONES: Record<string, string> = {
  red: "border-red-500/30",
  amber: "border-amber-500/30",
  sky: "border-sky-500/30",
  emerald: "border-emerald-500/20",
  slate: "border-app",
};

function QueueItem({
  tone,
  kicker,
  title,
  meta,
  chip,
  actions,
  children,
  expanded,
  onToggle,
}: {
  tone: string;
  kicker: string;
  title: string;
  meta: string;
  chip: string;
  actions: React.ReactNode;
  children?: React.ReactNode;
  expanded: boolean;
  onToggle?: () => void;
}) {
  return (
    <Card className={TONES[tone]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold tracking-wide text-faint">{kicker}</p>
          <p className="mt-0.5 truncate text-sm font-medium text-app">{title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {meta} · <span className="text-emerald-600 dark:text-emerald-400/80">{chip}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onToggle && (
            <button onClick={onToggle} className="text-xs text-muted hover:text-app">
              {expanded ? "Hide" : "Read"}
            </button>
          )}
          {actions}
        </div>
      </div>
      {expanded && children}
    </Card>
  );
}

function EditBox({ value, onChange, onSave, onCancel, busy }: { value: string; onChange: (v: string) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={Math.max(6, value.split("\n").length + 2)}
        className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
      />
      <p className="mt-1 text-xs text-faint">Separate tweets with a blank line. Compliance re-runs on save.</p>
      <div className="mt-2 flex gap-2">
        <Button onClick={onSave} disabled={busy}>Save & re-check</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

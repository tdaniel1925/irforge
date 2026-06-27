"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, EmptyState, ErrorBanner, FlagList, LoadingState, PageHeader, StatusPill, Thread, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Draft } from "@/lib/types";

const TABS = ["needs action", "approved", "posted", "archive"] as const;
type Tab = (typeof TABS)[number];

const SUCCESS_MESSAGES: Record<string, string> = {
  approve: "Approved. When you're ready, tap 'Publish to X' (it moves to the Approved tab).",
  reject: "Rejected — it won't be posted. You can find it in the Archive tab.",
  publish: "Published! Disclosures were added automatically. See it in the Posted tab.",
  edit: "Saved. The compliance check ran again on your new wording.",
};

// The AI-drafted X-thread approval inbox (iros pipeline). Extracted from the old
// /approvals page so it can be embedded in the unified Posts page. `embedded` hides
// the standalone header.
export default function ApprovalsInbox({ embedded = false }: { embedded?: boolean }) {
  const { db, error, busy, act } = useAppState();
  const [tab, setTab] = useState<Tab>("needs action");
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const byTab: Record<Tab, Draft[]> = {
    "needs action": db.drafts.filter((d) => d.status === "pending" || d.status === "blocked"),
    approved: db.drafts.filter((d) => d.status === "approved"),
    posted: db.drafts.filter((d) => d.status === "posted"),
    archive: db.drafts.filter((d) => d.status === "rejected"),
  };
  const drafts = byTab[tab];

  const run = async (url: string, body: { action: string; tweets?: string[] }) => {
    setNotice(null);
    const err = await act(url, "PATCH", body);
    setNotice(err ? { text: err, tone: "error" } : { text: SUCCESS_MESSAGES[body.action] ?? "Done.", tone: "success" });
  };

  const startEdit = (d: Draft) => {
    setEditing(d.id);
    setEditText(d.tweets.join("\n\n"));
  };

  const saveEdit = async (id: string) => {
    await run(`/api/drafts/${id}`, { action: "edit", tweets: editText.split(/\n\s*\n/) });
    setEditing(null);
  };

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="Approve Posts"
          subtitle="Read each draft, then Approve (good to go), Edit (change the wording), or Reject (don't post it). Nothing goes on X until you say so."
        />
      )}
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      {db.company.quietMode && (
        <Banner
          tone="info"
          message="Quiet mode is ON — you can still approve drafts, but nothing will publish until you turn it off in Settings."
        />
      )}

      <div className="mb-5 flex gap-1 rounded-lg border border-app bg-surface p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3.5 py-1.5 capitalize transition ${
              tab === t ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"
            }`}
          >
            {t} ({byTab[t].length})
          </button>
        ))}
      </div>

      {drafts.length === 0 ? (
        <EmptyState message={tab === "needs action" ? "Nothing needs your attention. New drafts appear here automatically." : `No drafts in '${tab}'.`} />
      ) : (
        <div className="space-y-4">
          {drafts.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-medium text-app">{d.title}</h3>
                    <StatusPill status={d.status} />
                  </div>
                  <p className="mt-1 text-xs text-faint">
                    {d.kind.replace("_", " ")} · drafted {timeAgo(d.createdAt)} via {d.aiEngine}
                    {d.decidedBy && ` · decided by ${d.decidedBy}`}
                    {d.postedAt && ` · posted ${timeAgo(d.postedAt)}`}
                    {d.postUrl && (
                      <>
                        {" · "}
                        <a href={d.postUrl} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline dark:text-emerald-400">
                          view on X ↗
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  {d.status === "pending" && (
                    <>
                      <Button onClick={() => run(`/api/drafts/${d.id}`, { action: "approve" })} disabled={busy}>
                        ✓ Approve
                      </Button>
                      <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => run(`/api/drafts/${d.id}`, { action: "reject" })} disabled={busy}>
                        Reject
                      </Button>
                    </>
                  )}
                  {d.status === "blocked" && (
                    <>
                      <Button variant="secondary" onClick={() => startEdit(d)} disabled={busy}>
                        Edit to fix
                      </Button>
                      <Button variant="danger" onClick={() => run(`/api/drafts/${d.id}`, { action: "reject" })} disabled={busy}>
                        Discard
                      </Button>
                    </>
                  )}
                  {d.status === "approved" && (
                    <Button
                      onClick={() => run(`/api/drafts/${d.id}`, { action: "publish" })}
                      disabled={busy || db.company.quietMode}
                      title={db.company.quietMode ? "Quiet mode is on" : undefined}
                    >
                      ↗ Publish to X
                    </Button>
                  )}
                </div>
              </div>

              <FlagList flags={d.complianceFlags} />

              {editing === d.id ? (
                <div className="mt-3">
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={Math.max(6, editText.split("\n").length + 2)}
                    className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-faint">Separate tweets with a blank line. Compliance re-runs on save.</p>
                  <div className="mt-2 flex gap-2">
                    <Button onClick={() => saveEdit(d.id)} disabled={busy}>
                      Save & re-check
                    </Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Thread tweets={d.tweets} handle={db.company.xHandle} />
              )}

              {d.status !== "posted" && (
                <p className="mt-3 text-xs text-faint">
                  On publish, the forward-looking-statements notice and the 17(b) disclosure are appended automatically — this cannot be disabled.
                  {db.hasAyrshare && d.status === "approved" && (
                    <span className="ml-1 font-medium text-amber-600 dark:text-amber-400/80">Ayrshare is connected: publishing posts to your real X account.</span>
                  )}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, EmptyState, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Sentiment } from "@/lib/types";

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "bg-emerald-500/15 text-emerald-300",
  neutral: "bg-slate-700/40 text-slate-300",
  negative: "bg-red-500/15 text-red-300",
  question: "bg-sky-500/15 text-sky-300",
};

export default function MentionsPage() {
  const { db, error, busy, act } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const draftReply = async (id: string) => {
    setNotice(null);
    const err = await act(`/api/mentions/${id}/reply`, "POST");
    setNotice(
      err
        ? { text: err, tone: "error" }
        : { text: "Reply drafted — go to Approve Posts to read and approve it before it's sent.", tone: "success" }
    );
  };

  return (
    <div>
      <PageHeader
        title="Questions & Chatter"
        subtitle={`What people on X are saying about $${db.company.ticker}. Click "Draft reply" and AI writes an answer using only your public filings — you approve before anything is sent.`}
      />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {db.mentions.length === 0 ? (
        <EmptyState message="No tracked mentions yet." />
      ) : (
        <div className="space-y-3">
          {db.mentions.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{m.author}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SENTIMENT_STYLE[m.sentiment]}`}>
                      {m.sentiment}
                    </span>
                    {m.requiresNonPublicInfo && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300" title="Answering this directly could break disclosure rules — we draft a safe response instead">
                        ⚠ can&apos;t answer directly
                      </span>
                    )}
                    <span className="text-xs text-slate-500">{timeAgo(m.ts)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{m.text}</p>
                  {m.requiresNonPublicInfo && (
                    <p className="mt-2 text-xs text-amber-300/80">
                      Why the caution flag: answering this would reveal information that isn&apos;t public yet, which securities rules don&apos;t allow.
                      The drafted reply politely points to your public filings instead.
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {m.replyDraftId ? (
                    <Link href="/approvals" className="text-xs text-emerald-400 hover:underline">
                      Reply drafted → review
                    </Link>
                  ) : (
                    <Button onClick={() => draftReply(m.id)} disabled={busy} variant={m.sentiment === "question" ? "primary" : "secondary"}>
                      ✦ Draft reply
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

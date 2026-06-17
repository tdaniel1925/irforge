"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { Sentiment } from "@/lib/types";

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  neutral: "bg-surface-2 text-muted",
  negative: "bg-red-500/15 text-red-600 dark:text-red-300",
  question: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
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
        <Card className="border-dashed">
          <div className="py-10 text-center">
            <p className="text-lg font-medium text-app">No mentions tracked yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              We&apos;ll surface public posts about ${db.company.ticker} here as they show up. In the meantime, see what
              investors are reading across the market.
            </p>
            <div className="mt-4 flex justify-center">
              <Link
                href="/discover"
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
              >
                Explore Discover
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {db.mentions.map((m) => (
            <Card key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-app">{m.author}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SENTIMENT_STYLE[m.sentiment]}`}>
                      {m.sentiment}
                    </span>
                    {m.requiresNonPublicInfo && (
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-300" title="Answering this directly could break disclosure rules — we draft a safe response instead">
                        ⚠ can&apos;t answer directly
                      </span>
                    )}
                    <span className="text-xs text-faint">{timeAgo(m.ts)}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted">{m.text}</p>
                  {m.requiresNonPublicInfo && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-300/80">
                      Why the caution flag: answering this would reveal information that isn&apos;t public yet, which securities rules don&apos;t allow.
                      The drafted reply politely points to your public filings instead.
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {m.replyDraftId ? (
                    <Link href="/approvals" className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">
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

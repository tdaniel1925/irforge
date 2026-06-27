"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import ApprovalsInbox from "@/components/ApprovalsInbox";
import SocialReview from "@/components/SocialReview";
import SocialMonthCalendar from "@/components/SocialMonthCalendar";
import SocialOutbox from "@/components/SocialOutbox";

// One pipeline view for everything post-creation: a single mental model with tabs.
//   • Needs approval → the AI-draft inbox (X threads) + the social calendar Review,
//                      both human-gated; nothing publishes without approval.
//   • Scheduled      → the month calendar (and a list toggle) of upcoming posts.
//   • Published      → delivery outcomes + failures (the old Outbox).

type Tab = "approve" | "scheduled" | "published";

interface PostsProps {
  canSocial: boolean;
  reviewSlots: unknown[];
  outboxPosts: unknown[];
  linkedAccounts: string[];
  year: number;
  month: number;
}

const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: "approve", label: "✅ Needs approval", hint: "Review, edit, approve or reject" },
  { key: "scheduled", label: "🗓️ Scheduled", hint: "Upcoming posts on a calendar" },
  { key: "published", label: "📤 Published", hint: "What went out + delivery status" },
];

export default function PostsShell(props: PostsProps) {
  const [tab, setTab] = useState<Tab>("approve");
  const [schedView, setSchedView] = useState<"calendar" | "list">("calendar");

  return (
    <div>
      <PageHeader title="Posts" subtitle="Everything in one pipeline — what needs your approval, what's scheduled, and what's published. Every post is compliance-checked and nothing goes out without you." />

      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.key ? "border-emerald-500/60 bg-emerald-500/10 text-app" : "border-app bg-surface-2/40 text-muted hover:bg-app-hover hover:text-app"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "approve" && (
        <div className="space-y-8">
          {/* AI-drafted X threads (iros) */}
          <ApprovalsInbox embedded />
          {/* Social-calendar posts awaiting review (only when that feature is on) */}
          {props.canSocial && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">Scheduled-post drafts</h2>
              <SocialReview initialSlots={props.reviewSlots as never} />
            </div>
          )}
        </div>
      )}

      {tab === "scheduled" && (
        props.canSocial ? (
          <div>
            <div className="mb-3 flex gap-1.5">
              {(["calendar", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setSchedView(v)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    schedView === v ? "border-emerald-500/60 bg-emerald-500/10 text-app" : "border-app bg-surface-2/40 text-muted hover:bg-app-hover"
                  }`}
                >
                  {v === "calendar" ? "Calendar" : "List"}
                </button>
              ))}
            </div>
            {schedView === "calendar"
              ? <SocialMonthCalendar year={props.year} month={props.month} />
              : <SocialOutbox initialPosts={props.outboxPosts as never} linkedAccounts={props.linkedAccounts} />}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-app bg-surface-2/40 px-4 py-6 text-center text-sm text-muted">
            Scheduling is part of the AI Content Engine. Generate a calendar in Compose → Plan a month to see scheduled posts here.
          </p>
        )
      )}

      {tab === "published" && (
        <SocialOutbox initialPosts={props.outboxPosts as never} linkedAccounts={props.linkedAccounts} />
      )}
    </div>
  );
}

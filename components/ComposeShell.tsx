"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import QuickPostComposer from "@/components/QuickPostComposer";
import EditorialBoard from "@/components/EditorialBoard";
import SocialEngine from "@/components/SocialEngine";
import StudioEditor from "@/components/StudioEditor";
import UpgradePrompt from "@/components/UpgradePrompt";

// One unified Compose surface. A mode toggle picks how you want to create:
//   • Post now      → Quick Post (compose → preview → publish immediately)
//   • Schedule      → Editorial board (draft → Reg-FD → approve → schedule)
//   • Plan a month  → AI engine (bulk-generate a month of posts)
//   • Press release → long-form press release builder
// Each mode reuses its existing, proven component — same compliance gates intact.

type Mode = "now" | "schedule" | "month" | "press";

interface ComposeProps {
  ticker: string;
  // feature flags (gate each mode; show an upgrade prompt when off)
  canPipeline: boolean;
  canSocial: boolean;
  canPublish: boolean;
  // server-fetched props for the embedded components
  pipelinePosts: unknown[];
  voices: { id: string; name: string; roleTitle: string }[];
  strategy: unknown;
  channels: { key: string; label: string }[];
  slots: unknown[];
}

const TABS: { key: Mode; label: string; hint: string }[] = [
  { key: "now", label: "⚡ Post now", hint: "Compose and publish immediately" },
  { key: "schedule", label: "🗓️ Schedule", hint: "Draft, check, approve & schedule" },
  { key: "month", label: "✨ Plan a month", hint: "AI builds a month of posts" },
  { key: "press", label: "📝 Press release", hint: "Long-form, AP-style release" },
];

export default function ComposeShell(props: ComposeProps) {
  const [mode, setMode] = useState<Mode>("now");

  return (
    <div>
      <PageHeader title="Compose" subtitle="Create a post your way — publish now, schedule it, plan a whole month, or draft a press release. Every path runs the same compliance checks, and nothing publishes without your approval." />

      {/* Mode toggle */}
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setMode(t.key)}
            title={t.hint}
            className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
              mode === t.key
                ? "border-emerald-500/60 bg-emerald-500/10 text-app"
                : "border-app bg-surface-2/40 text-muted hover:bg-app-hover hover:text-app"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "now" && <QuickPostComposer embedded />}

      {mode === "schedule" && (
        props.canPipeline ? (
          <EditorialBoard
            initialPosts={props.pipelinePosts as never}
            voices={props.voices}
            canPublish={props.canPublish}
          />
        ) : (
          <UpgradePrompt
            icon="🧩"
            title="Schedule & pipeline"
            pitch="One board to take any post from idea to published — with the Reg FD check and approvals built in."
            bullets={[
              "Type a topic, AI drafts it (in an executive's voice)",
              "1-click Reg FD check routes risky posts to counsel",
              "Approve, schedule, and publish to every channel",
            ]}
          />
        )
      )}

      {mode === "month" && (
        props.canSocial ? (
          <SocialEngine
            initialStrategy={props.strategy as never}
            channels={props.channels}
            initialSlots={props.slots as never}
          />
        ) : (
          <UpgradePrompt
            icon="✨"
            title="Plan a month with AI"
            pitch="Answer a short interview once. AI builds a full social calendar from your public record and drafts compliant posts for every platform — you review and approve in bulk."
            bullets={[
              "Guided interview captures goals, voice, and audience",
              "AI plans a full calendar from your filings",
              "Per-platform compliant drafts with images",
              "Bulk review, edit, approve — nothing posts without you",
            ]}
          />
        )
      )}

      {mode === "press" && <StudioEditor companyTicker={props.ticker} />}
    </div>
  );
}

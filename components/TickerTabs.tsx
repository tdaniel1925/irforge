"use client";

import { useState } from "react";

// Overview (info) and Discussion as tabs. Defaults to Overview so a visitor
// always lands on the data first — the board is one click, no scrolling past info,
// and there's no way to deep-link straight to posts without seeing the overview.
export default function TickerTabs({
  ticker,
  overview,
  discussion,
}: {
  ticker: string;
  overview: React.ReactNode;
  discussion: React.ReactNode;
}) {
  const [tab, setTab] = useState<"overview" | "discussion">("overview");

  return (
    <div>
      <div className="mb-6 flex gap-1 rounded-xl border border-app bg-surface p-1">
        <TabButton active={tab === "overview"} onClick={() => setTab("overview")}>
          Overview
        </TabButton>
        <TabButton active={tab === "discussion"} onClick={() => setTab("discussion")}>
          Discussion
        </TabButton>
      </div>
      {tab === "overview" ? (
        <div>
          {overview}
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center text-sm">
            <span className="text-muted">Seen the data? </span>
            <button onClick={() => setTab("discussion")} className="font-semibold text-emerald-500 hover:underline">
              Join the ${ticker} discussion →
            </button>
          </div>
        </div>
      ) : (
        discussion
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
        active ? "bg-surface-2 text-app shadow-sm" : "text-muted hover:text-app"
      }`}
    >
      {children}
    </button>
  );
}

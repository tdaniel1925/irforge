"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { InvestorStage } from "@/lib/types";

const STAGES: { key: InvestorStage; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "outreach_drafted", label: "Outreach drafted" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting", label: "Meeting" },
  { key: "holder", label: "Holder" },
];

export default function InvestorsPage() {
  const { db, error, busy, act, refresh } = useAppState();
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const setStage = async (id: string, stage: InvestorStage) => {
    setActionError(null);
    const err = await act(`/api/investors/${id}`, "PATCH", { stage });
    if (err) setActionError(err);
  };

  const generate = async () => {
    setActionError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/investors/generate", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Couldn't build a target list. Try again.");
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setGenerating(false);
    }
  };

  const peerList = db.company.peers.filter(Boolean);
  const hasInvestors = db.investors.length > 0;

  return (
    <div>
      <PageHeader
        title="Fund Finder"
        subtitle={
          peerList.length
            ? `Funds that tend to hold companies like yours (${peerList.map((p) => "$" + p).join(", ")}) — researched from public SEC records, each with a ready-to-personalize intro note. Your team sends it; use the dropdown to track progress.`
            : `A research list of institutional investors to approach for $${db.company.ticker}, each with a ready-to-personalize intro note. Add peer tickers in Settings for sharper targeting. Your team does the outreach; use the dropdown to track progress.`
        }
      />

      <div className="mb-4 flex justify-end">
        <Button onClick={generate} disabled={busy || generating}>
          {generating ? "Finding funds…" : hasInvestors ? "↻ Refresh target list" : "🎯 Find investor targets"}
        </Button>
      </div>
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      <Card className="mb-5 border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-amber-700 dark:text-amber-200/90">
          Compliance note: PubcoZone charges a flat fee and never compensation tied to investment outcomes. Target lists are built
          from public 13F filings. Your company conducts its own outreach — PubcoZone does not solicit investors on your behalf.
        </p>
      </Card>

      {db.investors.length === 0 ? (
        <Card className="border-dashed">
          <div className="py-10 text-center">
            <p className="text-lg font-medium text-app">No targets yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              Tap <span className="font-medium text-app">Find investor targets</span> and we&apos;ll build a research list of
              funds to approach — each with a ready-to-send intro note you can personalize.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {db.investors.map((inv) => (
            <Card key={inv.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-app">{inv.fund}</h3>
                  <p className="mt-0.5 text-xs text-faint">
                    {inv.type} · AUM {inv.aum}{inv.peersHeld.length ? ` · may hold ${inv.peersHeld.map((p) => "$" + p).join(", ")}` : ""}
                  </p>
                </div>
                <select
                  value={inv.stage}
                  disabled={busy}
                  onChange={(e) => setStage(inv.id, e.target.value as InvestorStage)}
                  className="rounded-lg border border-app bg-surface-2 px-3 py-1.5 text-sm text-app focus:border-emerald-500 focus:outline-none"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-sm text-muted">{inv.positionNote}</p>
              <div className="mt-3 rounded-lg border border-app bg-surface-2/70 p-3">
                <p className="mb-1 text-xs font-semibold text-faint">READY-TO-SEND INTRO NOTE (copy, personalize, and send from your own email)</p>
                <p className="text-sm leading-relaxed text-app">{inv.outreachDraft}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

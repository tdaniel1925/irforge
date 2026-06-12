"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Card, EmptyState, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { InvestorStage } from "@/lib/types";

const STAGES: { key: InvestorStage; label: string }[] = [
  { key: "identified", label: "Identified" },
  { key: "outreach_drafted", label: "Outreach drafted" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting", label: "Meeting" },
  { key: "holder", label: "Holder" },
];

export default function InvestorsPage() {
  const { db, error, busy, act } = useAppState();
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const setStage = async (id: string, stage: InvestorStage) => {
    setActionError(null);
    const err = await act(`/api/investors/${id}`, "PATCH", { stage });
    if (err) setActionError(err);
  };

  return (
    <div>
      <PageHeader
        title="Fund Finder"
        subtitle={`These funds already invest in companies like yours (${db.company.peers.map((p) => "$" + p).join(", ")}) — but not in $${db.company.ticker} yet. We found them in public SEC records and wrote an intro note for each. Your team sends it; use the dropdown to track progress.`}
      />
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}

      <Card className="mb-5 border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-amber-200/90">
          Compliance note: IRForge charges a flat fee and never compensation tied to investment outcomes. Target lists are built
          from public 13F filings. Your company conducts its own outreach — IRForge does not solicit investors on your behalf.
        </p>
      </Card>

      {db.investors.length === 0 ? (
        <EmptyState message="No targets identified yet." />
      ) : (
        <div className="space-y-4">
          {db.investors.map((inv) => (
            <Card key={inv.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-white">{inv.fund}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {inv.type} · AUM {inv.aum} · holds {inv.peersHeld.map((p) => "$" + p).join(", ")}
                  </p>
                </div>
                <select
                  value={inv.stage}
                  disabled={busy}
                  onChange={(e) => setStage(inv.id, e.target.value as InvestorStage)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="mt-3 text-sm text-slate-400">{inv.positionNote}</p>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                <p className="mb-1 text-xs font-semibold text-slate-500">READY-TO-SEND INTRO NOTE (copy, personalize, and send from your own email)</p>
                <p className="text-sm leading-relaxed text-slate-300">{inv.outreachDraft}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

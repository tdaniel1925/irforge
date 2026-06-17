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
              {inv.source && (
                <span className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${inv.source === "sec_13f" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>
                  {inv.source === "sec_13f" ? "✓ Real SEC 13F filer" : "AI-suggested — verify"}
                </span>
              )}
              <p className="mt-3 text-sm text-muted">{inv.positionNote}</p>

              {/* Real contact details + verification paths */}
              {(inv.address || inv.phone || inv.edgarUrl || inv.advSearchUrl) && (
                <div className="mt-3 grid gap-2 rounded-lg border border-app bg-surface p-3 text-sm sm:grid-cols-2">
                  {inv.address && <div><span className="text-xs font-semibold text-faint">Address</span><p className="text-app">{inv.address}</p></div>}
                  {inv.phone && <div><span className="text-xs font-semibold text-faint">Phone</span><p className="text-app">{inv.phone}</p></div>}
                  <div className="sm:col-span-2 flex flex-wrap gap-3 pt-1">
                    {inv.edgarUrl && <a href={inv.edgarUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">SEC 13F filings ↗</a>}
                    {inv.advSearchUrl && <a href={inv.advSearchUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400">Find contact (SEC IAPD / Form ADV) ↗</a>}
                  </div>
                  <p className="sm:col-span-2 text-[11px] text-faint">Email isn&apos;t in SEC data — use the firm&apos;s ADV / website to confirm the right contact before reaching out.</p>
                </div>
              )}

              {inv.submissionCriteria && (
                <div className="mt-3 rounded-lg border border-app bg-surface-2/50 p-3">
                  <p className="mb-1 text-xs font-semibold text-faint">HOW TO APPROACH</p>
                  <p className="text-sm leading-relaxed text-muted">{inv.submissionCriteria}</p>
                </div>
              )}

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

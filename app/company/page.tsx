"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { ThreatReport } from "@/lib/threats";
import type { Scorecard } from "@/lib/score";

const SEV: Record<string, { ring: string; chip: string; label: string }> = {
  high: { ring: "border-red-500/40", chip: "bg-red-500/15 text-red-600 dark:text-red-300", label: "HIGH" },
  medium: { ring: "border-amber-500/40", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300", label: "MEDIUM" },
  low: { ring: "border-app", chip: "bg-slate-500/15 text-faint", label: "LOW" },
};

export default function CompanyCommandCenter() {
  const { db, error, refresh } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [threats, setThreats] = useState<ThreatReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [card, setCard] = useState<Scorecard | null>(null);
  const [scoring, setScoring] = useState(false);

  // Auto-scan threats on load.
  useEffect(() => {
    (async () => {
      setScanning(true);
      try {
        const res = await fetch("/api/threats");
        if (res.ok) setThreats(await res.json());
      } catch {
        /* ignore */
      } finally {
        setScanning(false);
      }
    })();
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const last = db.scoreHistory[db.scoreHistory.length - 1];
  const prev = db.scoreHistory[db.scoreHistory.length - 2];
  const score = card?.score ?? last?.score ?? 0;
  const grade = card?.grade ?? last?.grade ?? "F";
  const delta = card && last ? card.score - last.score : last && prev ? last.score - prev.score : 0;

  const pending = db.drafts.filter((d) => d.status === "pending");
  const openQ = db.publicQuestions.filter((q) => q.status === "open");
  const posted30 = db.drafts.filter((d) => d.status === "posted").length;
  const highThreats = threats?.threats.filter((t) => t.severity === "high").length ?? 0;

  const rebut = async (title: string, evidence?: string) => {
    setNotice(null);
    try {
      const res = await fetch("/api/threats/rebut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, evidence }),
      });
      const data = await res.json();
      if (!res.ok) setNotice({ text: data.error ?? "Failed.", tone: "error" });
      else {
        setNotice({ text: "Rebuttal drafted from your filings — approve it in the Do queue and it posts (and disclosures attach).", tone: "success" });
        await refresh();
      }
    } catch {
      setNotice({ text: "Network error.", tone: "error" });
    }
  };

  const refreshScore = async () => {
    setScoring(true);
    try {
      const res = await fetch("/api/score", { method: "POST" });
      if (res.ok) setCard(await res.json());
      await refresh();
    } finally {
      setScoring(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Defense & Reach"
        subtitle="Two things this page shows you: (1) anyone attacking or spreading false info about your company right now, with a one-tap factual response ready, and (2) how visible you are to investors and whether that's improving."
      >
        <Link href={`/t/${db.company.ticker}`} target="_blank" className="rounded-lg border border-app px-3.5 py-2 text-sm text-app hover:bg-app-hover">
          View public page ↗
        </Link>
      </PageHeader>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {/* Top strip — the three jobs as headline numbers */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className={highThreats > 0 ? "border-red-500/40" : "border-emerald-500/30"}>
          <p className="text-xs font-semibold tracking-wide text-faint">🛡 DEFEND</p>
          <p className="mt-1 text-2xl font-semibold text-app">
            {threats ? threats.threats.length : "…"} <span className="text-base font-normal text-muted">threats tracked</span>
          </p>
          <p className="mt-1 text-xs text-muted">{highThreats > 0 ? `${highThreats} need attention now` : "Nothing urgent — you're covered"}</p>
        </Card>
        <Card className="border-sky-500/30">
          <p className="text-xs font-semibold tracking-wide text-faint">📈 GROW</p>
          <p className="mt-1 text-2xl font-semibold text-app">
            {score} <span className="text-base font-normal text-muted">({grade})</span>
            {delta !== 0 && <span className={`ml-2 text-sm ${delta > 0 ? "text-emerald-500" : "text-red-500"}`}>{delta > 0 ? "▲" : "▼"}{Math.abs(delta)}</span>}
          </p>
          <p className="mt-1 text-xs text-muted">Visibility score · {posted30} posts published</p>
        </Card>
        <Card className="border-emerald-500/30">
          <p className="text-xs font-semibold tracking-wide text-faint">🎙 CONTROL</p>
          <p className="mt-1 text-2xl font-semibold text-app">
            {openQ.length} <span className="text-base font-normal text-muted">questions waiting</span>
          </p>
          <p className="mt-1 text-xs text-muted">{pending.length} drafts ready for your approval</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* DEFEND — the threat radar, the lead module */}
        <div className="lg:col-span-2">
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-semibold text-app">🛡 Who&apos;s attacking or doubting you</h2>
              <span className="text-xs text-faint">{scanning ? "checking now…" : threats ? `checked ${timeAgo(threats.generatedAt)}` : ""}</span>
            </div>
            <p className="mb-3 text-xs text-muted">We watch message boards, social media, news, and trading data. If someone spreads false info or sentiment turns against you, it shows up here — with a factual response ready for you to approve.</p>
            {!threats ? (
              <p className="py-6 text-sm text-faint">Scanning the board, StockTwits, news, short data, and halts…</p>
            ) : threats.threats.length === 0 ? (
              <p className="py-6 text-sm text-muted">No active threats. The conversation is clean and the tape is calm — we&apos;ll alert you the moment that changes.</p>
            ) : (
              <div className="space-y-3">
                {threats.threats.map((t) => {
                  const s = SEV[t.severity];
                  return (
                    <div key={t.id} className={`rounded-xl border p-3.5 ${s.ring}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded px-1.5 py-0.5 font-bold ${s.chip}`}>{s.label}</span>
                        <span className="font-medium text-muted">{t.source}</span>
                        <span className="text-faint">{timeAgo(t.ts)}</span>
                      </div>
                      <p className="text-sm font-medium text-app">{t.title}</p>
                      <p className="mt-1 text-xs text-muted">{t.detail}</p>
                      {t.evidence && (
                        <p className="mt-2 rounded-lg border border-app bg-surface-2 px-3 py-1.5 text-xs italic text-muted">&ldquo;{t.evidence}&rdquo;</p>
                      )}
                      <div className="mt-2.5">
                        <Button onClick={() => rebut(t.title, t.evidence)}>✦ Draft a fact-based response</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* GROW + CONTROL stacked */}
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 font-semibold text-app">📈 Grow</h2>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted">Refresh your visibility score from live data.</p>
              <Button variant="secondary" onClick={refreshScore} disabled={scoring}>{scoring ? "…" : "↻"}</Button>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>· {posted30} posts published</li>
              <li>· {db.scoreHistory.length} score snapshots tracked</li>
              <li>· <Link href="/proof" className="text-emerald-500 hover:underline">See the board-ready proof →</Link></li>
            </ul>
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold text-app">🎙 Control</h2>
            <p className="text-sm text-muted">Your verified voice in the conversation.</p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              <li>· {openQ.length} investor question{openQ.length === 1 ? "" : "s"} awaiting your answer</li>
              <li>· {pending.length} draft{pending.length === 1 ? "" : "s"} ready to approve</li>
            </ul>
            <Link href="/do" className="mt-3 inline-block rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-sm font-semibold text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-300">
              Go to your queue →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

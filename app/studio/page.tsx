"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, FlagList, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { DisclosureCheck, PressRelease } from "@/lib/types";
import StudioEditor from "@/components/StudioEditor";

export default function Studio() {
  const { db, error, refresh } = useAppState();
  const [tab, setTab] = useState<"editor" | "press" | "disclosure">("editor");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="Writing Studio"
        subtitle="A live AI editor for your IR content — generate, edit by hand, and tell the AI to revise, all in one place. Plus a press-release builder and a disclosure helper."
      />

      <div className="mb-5 flex gap-1 rounded-lg border border-app bg-surface p-1 text-sm">
        <button onClick={() => setTab("editor")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "editor" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>AI Editor</button>
        <button onClick={() => setTab("press")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "press" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Press release</button>
        <button onClick={() => setTab("disclosure")} className={`rounded-md px-3.5 py-1.5 transition ${tab === "disclosure" ? "bg-surface-2 font-medium text-app" : "text-muted hover:text-app"}`}>Disclosure helper</button>
      </div>

      {tab === "editor" ? <StudioEditor companyTicker={db.company.ticker} />
        : tab === "press" ? <PressBuilder db={db} refresh={refresh} />
        : <DisclosureHelper db={db} refresh={refresh} />}
    </div>
  );
}

function PressBuilder({ db, refresh }: { db: any; refresh: () => void }) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const draft = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/press", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic }) });
      const data = await res.json();
      setNotice(res.ok ? { text: "Draft ready below. Read it, then approve.", tone: "success" } : { text: data.error ?? "Failed.", tone: "error" });
      if (res.ok) { setTopic(""); await refresh(); }
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(false); }
  };

  const act = async (id: string, action: string) => {
    if (acting) return;
    setActing(id); setNotice(null);
    try {
      const res = await fetch("/api/press", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      const data = await res.json().catch(() => ({}));
      setNotice(res.ok ? { text: action === "approve" ? "Release approved." : "Draft discarded.", tone: "success" } : { text: data.error ?? "Failed.", tone: "error" });
      if (res.ok) await refresh();
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setActing(null); }
  };

  const releases: PressRelease[] = db.pressReleases;

  return (
    <div>
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      <Card className="mb-6">
        <p className="mb-2 text-sm font-medium text-app">What&apos;s the news?</p>
        <p className="mb-3 text-xs text-muted">Plain words are fine — &ldquo;we signed an offtake MOU,&rdquo; &ldquo;Q2 results,&rdquo; &ldquo;new COO hire.&rdquo; We&apos;ll write the AP-style release with boilerplate and safe-harbor language.</p>
        <div className="flex gap-2">
          <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && topic && draft()} placeholder="e.g. Phase 3 drill program results" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <Button onClick={draft} disabled={busy || !topic}>{busy ? "Writing…" : "Draft release"}</Button>
        </div>
      </Card>

      {releases.length === 0 ? (
        <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">No press releases yet.</p></Card>
      ) : (
        <div className="space-y-4">
          {releases.map((pr) => (
            <Card key={pr.id} className={pr.status === "approved" ? "border-emerald-500/30" : ""}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${pr.status === "approved" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" : pr.status === "rejected" ? "bg-slate-500/15 text-faint" : "bg-amber-500/15 text-amber-600 dark:text-amber-300"}`}>{pr.status}</span>
                <span className="text-xs text-faint">{timeAgo(pr.createdAt)}</span>
              </div>
              <h3 className="text-base font-semibold text-app">{pr.headline}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{pr.body}</p>
              <FlagList flags={pr.complianceFlags} />
              {pr.status === "pending" && (
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => act(pr.id, "approve")} disabled={acting === pr.id}>{acting === pr.id ? "…" : "✓ Approve release"}</Button>
                  <Button variant="danger" onClick={() => act(pr.id, "reject")} disabled={acting === pr.id}>✕ Discard</Button>
                </div>
              )}
              <p className="mt-3 text-xs text-faint">Once approved, copy this into your wire service (GlobeNewswire, ACCESSWIRE) or paste into Settings to add it to your public page.</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DisclosureHelper({ db, refresh }: { db: any; refresh: () => void }) {
  const [event, setEvent] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const check = async () => {
    setBusy(true); setNotice(null);
    try {
      const res = await fetch("/api/disclosure", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }) });
      const data = await res.json();
      setNotice(res.ok ? null : { text: data.error ?? "Failed.", tone: "error" });
      if (res.ok) { setEvent(""); await refresh(); }
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(false); }
  };

  const checks: DisclosureCheck[] = db.disclosureChecks;

  return (
    <div>
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}
      <Banner tone="info" message="This is a drafting assistant, not legal advice. It flags whether an event is the kind of thing usually disclosed and drafts starter language — always confirm materiality and timing with your securities counsel." />
      <Card className="mb-6">
        <p className="mb-2 text-sm font-medium text-app">Something happen? Check if you need to disclose it.</p>
        <p className="mb-3 text-xs text-muted">Describe it plainly — &ldquo;we appointed a new director,&rdquo; &ldquo;we signed a $5M supply contract,&rdquo; &ldquo;we got a Nasdaq deficiency letter.&rdquo;</p>
        <div className="flex gap-2">
          <input value={event} onChange={(e) => setEvent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && event && check()} placeholder="e.g. We signed a binding offtake agreement" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <Button onClick={check} disabled={busy || !event}>{busy ? "Checking…" : "Check it"}</Button>
        </div>
      </Card>

      {checks.length === 0 ? (
        <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">No checks yet.</p></Card>
      ) : (
        <div className="space-y-4">
          {checks.map((c) => (
            <Card key={c.id}>
              <p className="text-sm text-muted">You asked about:</p>
              <p className="mb-3 text-sm font-medium text-app">&ldquo;{c.event}&rdquo;</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${c.likelyMaterial ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : "bg-slate-500/15 text-faint"}`}>{c.likelyMaterial ? "LIKELY REPORTABLE" : "LIKELY NOT 8-K"}</span>
                <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-app">{c.form}</span>
              </div>
              <p className="mt-2 text-sm text-muted">{c.reasoning}</p>
              <div className="mt-3 rounded-lg border border-app bg-surface-2 p-3">
                <p className="mb-1 text-xs font-semibold text-faint">STARTER LANGUAGE (review with counsel)</p>
                <p className="text-sm text-app">{c.draftLanguage}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

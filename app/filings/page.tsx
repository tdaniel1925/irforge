"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, EmptyState, ErrorBanner, LoadingState, PageHeader, timeAgo } from "@/components/ui";
import type { Notice } from "@/components/ui";

export default function FilingsPage() {
  const { db, error, busy, act, refresh } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [syncing, setSyncing] = useState(false);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const sync = async () => {
    setSyncing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/filings/sync", { method: "POST" });
      // Match useAppState.act: bounce to login on 401 instead of a confusing error.
      if (res.status === 401) { window.location.href = "/login"; return; }
      const data = await res.json().catch(() => ({}));
      // The sync route returns HTTP 200 with { ok: false, error } when EDGAR is
      // unreachable, so check data.ok — not just res.ok — to surface the failure.
      setNotice(
        res.ok && data.ok !== false
          ? { text: `Checked EDGAR — found ${data.added ?? 0} new filing(s).`, tone: "success" }
          : { text: data.error ?? `Sync failed (${res.status}).`, tone: "error" }
      );
    } catch {
      setNotice({ text: "Sync failed — network error.", tone: "error" });
    } finally {
      setSyncing(false);
      await refresh();
    }
  };

  const generate = async (id: string) => {
    setNotice(null);
    const err = await act(`/api/filings/${id}/generate`, "POST");
    setNotice(
      err
        ? { text: err, tone: "error" }
        : { text: "Done! Your post is drafted — go to Approve Posts to read and approve it.", tone: "success" }
    );
  };

  const cadence = async () => {
    setNotice(null);
    const err = await act("/api/drafts", "POST");
    setNotice(
      err
        ? { text: err, tone: "error" }
        : { text: "Done! A keep-the-feed-alive post is drafted — go to Approve Posts to read it.", tone: "success" }
    );
  };

  return (
    <div>
      <PageHeader
        title="SEC Filings"
        subtitle="Every filing here can become a post with one click. We check EDGAR automatically — or check now with the button."
      >
        <Button variant="secondary" onClick={cadence} disabled={busy || syncing} title="Draft a post even when there's no news — keeps your account active">
          + Write a post (no news needed)
        </Button>
        <Button onClick={sync} disabled={syncing || busy}>
          {syncing ? "Checking…" : "↻ Check for new filings"}
        </Button>
      </PageHeader>

      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      {db.filings.length === 0 ? (
        <EmptyState message="No filings yet. Sync EDGAR or check the CIK in Settings." />
      ) : (
        <div className="space-y-3">
          {db.filings.map((f) => (
            <Card key={f.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted">{f.form}</span>
                    <span className="text-xs text-faint">
                      filed {timeAgo(f.filedAt)} · {f.source === "edgar" ? "live EDGAR" : "demo data"}
                    </span>
                  </div>
                  <h3 className="mt-2 font-medium text-app">{f.title}</h3>
                  <p className="mt-1 text-sm text-muted">{f.summary}</p>
                  <a href={f.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                    Open filing on sec.gov ↗
                  </a>
                </div>
                <div className="shrink-0">
                  {f.draftId ? (
                    <Link href="/approvals" className="text-xs text-emerald-600 hover:underline dark:text-emerald-400">
                      Post drafted ✓ → read & approve
                    </Link>
                  ) : (
                    <Button onClick={() => generate(f.id)} disabled={busy || syncing} title="AI writes a post about this filing for you to approve">
                      ✦ Turn into a post
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

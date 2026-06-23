"use client";

import { useState } from "react";

interface OutboxPost {
  id: string;
  platform: string;
  theme: string;
  body: string;
  mediaUrl: string;
  status: string;
  scheduledAt: string | null;
  postedAt: string | null;
  postUrl: string;
  ayrPostId: string;
  publishError: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "X (Twitter)", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram",
  youtube: "YouTube", tiktok: "TikTok", telegram: "Telegram", reddit: "Reddit",
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// One row's delivery state → badge.
function statusBadge(p: OutboxPost): { label: string; cls: string } {
  if (p.publishError) return { label: "Failed", cls: "bg-red-100 text-red-700" };
  if (p.status === "published") return { label: "Posted ✓", cls: "bg-emerald-100 text-emerald-700" };
  if (p.status === "pulled") return { label: "Pulled", cls: "bg-gray-200 text-gray-600" };
  // scheduled
  const due = p.scheduledAt && new Date(p.scheduledAt).getTime() < Date.now();
  return due
    ? { label: "Posting…", cls: "bg-amber-100 text-amber-700" }
    : { label: "Scheduled", cls: "bg-indigo-100 text-indigo-700" };
}

export default function SocialOutbox({ initialPosts, linkedAccounts }: { initialPosts: OutboxPost[]; linkedAccounts: string[] }) {
  const [posts, setPosts] = useState<OutboxPost[]>(initialPosts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const refresh = async () => {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/social/outbox", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't refresh.");
      setPosts(data.posts ?? []);
      setMsg(`Checked ${data.checked} · ${data.published} newly posted${data.failed ? ` · ${data.failed} failed` : ""}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const counts = posts.reduce(
    (a, p) => {
      if (p.publishError) a.failed++;
      else if (p.status === "published") a.posted++;
      else if (p.status === "scheduled") a.scheduled++;
      return a;
    },
    { scheduled: 0, posted: 0, failed: 0 }
  );

  if (!posts.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
        Nothing scheduled yet. Approve posts in <a href="/social/review" className="text-indigo-600">Review &amp; approve</a> and they&apos;ll appear here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary + refresh */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <span className="text-sm"><b>{counts.scheduled}</b> scheduled</span>
        <span className="text-sm text-emerald-700"><b>{counts.posted}</b> posted</span>
        {counts.failed > 0 && <span className="text-sm text-red-600"><b>{counts.failed}</b> failed</span>}
        <button disabled={busy} onClick={refresh} className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Checking…" : "Check delivery status"}
        </button>
      </div>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {posts.map((p) => {
        const badge = statusBadge(p);
        const channelLinked = linkedAccounts.length === 0 || linkedAccounts.includes(p.platform);
        return (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700">{PLATFORM_LABEL[p.platform] ?? p.platform}</span>
                  <span className={`rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>
                  {!channelLinked && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">⚠ {PLATFORM_LABEL[p.platform] ?? p.platform} not connected</span>}
                </div>

                <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800 line-clamp-4">{p.body}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span>🗓 {p.status === "published" ? `Posted ${fmt(p.postedAt)}` : `Scheduled ${fmt(p.scheduledAt)}`}</span>
                  {p.theme && <span>· {p.theme}</span>}
                  {p.postUrl && (
                    <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600">View live post ↗</a>
                  )}
                </div>

                {p.publishError && <p className="mt-2 text-xs text-red-600">⚠ {p.publishError}</p>}
              </div>

              {p.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.mediaUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

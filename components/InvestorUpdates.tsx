"use client";

import { useEffect, useState } from "react";

// Investor Updates — compose and send an update to investors who OPTED IN on the
// company's public page, plus a history of what's gone out. Answers "where do
// opt-ins go / how do I see what's sent." Compliance-gated + disclosures appended
// server-side (lib/investorUpdates); this is just the UI.

interface UpdateRow { id: string; subject: string; body: string; recipientCount: number; sentByEmail: string; createdAt: string }
interface Flag { rule: string; excerpt: string; severity: string }

export default function InvestorUpdates() {
  const [optedInCount, setOptedInCount] = useState<number | null>(null);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "success" | "error" } | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/investor-updates", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setOptedInCount(d.optedInCount ?? 0); setUpdates(d.updates ?? []); }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const send = async () => {
    setBusy(true); setNotice(null); setFlags([]);
    try {
      const res = await fetch("/api/investor-updates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ text: d.error ?? "Couldn't send.", tone: "error" });
        if (Array.isArray(d.flags)) setFlags(d.flags);
        return;
      }
      setNotice({ text: `Update sent to ${d.sent} investor${d.sent === 1 ? "" : "s"}.`, tone: "success" });
      setSubject(""); setBody("");
      await load();
    } catch { setNotice({ text: "Network error.", tone: "error" }); } finally { setBusy(false); }
  };

  const canSend = subject.trim().length > 0 && body.trim().length >= 10 && (optedInCount ?? 0) > 0 && !busy;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-app bg-surface p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-app">Send an investor update</h2>
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {optedInCount === null ? "…" : `${optedInCount} opted-in recipient${optedInCount === 1 ? "" : "s"}`}
          </span>
        </div>
        <p className="mb-3 text-sm text-muted">
          Goes to everyone who opted in to updates on your public page. It&apos;s compliance-checked (no material non-public info or
          price predictions), and your disclosures are attached automatically — just like a published post.
        </p>

        {notice && (
          <p className={`mb-3 rounded-lg border px-3 py-2 text-sm ${notice.tone === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"}`}>{notice.text}</p>
        )}
        {flags.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {flags.map((f, i) => (
              <div key={i} className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-300">
                <span className="font-semibold">BLOCKED</span> {f.rule}: <span className="italic">&ldquo;{f.excerpt}&rdquo;</span>
              </div>
            ))}
          </div>
        )}

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          placeholder="Subject — e.g. Q2 operational update"
          className="mb-2 w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          maxLength={20000}
          placeholder="Write your update. Keep it to the public record — filings, press releases, factual milestones. No price talk or forward-looking guarantees."
          className="w-full resize-y rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button onClick={send} disabled={!canSend} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? "Sending…" : `Send to ${optedInCount ?? 0} investor${optedInCount === 1 ? "" : "s"}`}
          </button>
          {(optedInCount ?? 0) === 0 && <span className="text-xs text-faint">No investors have opted in yet — they opt in from your public page.</span>}
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-app bg-surface p-5">
        <h2 className="mb-3 font-semibold text-app">Sent updates</h2>
        {loading ? (
          <p className="py-4 text-center text-sm text-faint">Loading…</p>
        ) : updates.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">No updates sent yet. Your first one will appear here.</p>
        ) : (
          <div className="space-y-2">
            {updates.map((u) => (
              <div key={u.id} className="rounded-lg border border-app bg-surface-2/50 px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-app">{u.subject}</p>
                  <span className="text-xs text-faint">{u.createdAt.slice(0, 10)} · {u.recipientCount} sent{u.sentByEmail ? ` · by ${u.sentByEmail}` : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{u.body.length > 240 ? u.body.slice(0, 240) + "…" : u.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";

interface Slot {
  id: string;
  scheduledAt: string | null;
  platform: string;
  theme: string;
  status: string;
  body: string;
  title: string;
  mediaUrl: string;
  classification: string | null;
  classFlags: string[];
}

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "X (Twitter)", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram",
  youtube: "YouTube", tiktok: "TikTok", telegram: "Telegram", reddit: "Reddit",
};

const CLASS_BADGE: Record<string, { label: string; cls: string }> = {
  green: { label: "Green — routine", cls: "bg-green-100 text-green-700" },
  yellow: { label: "Yellow — review closely", cls: "bg-amber-100 text-amber-700" },
  red: { label: "Red — counsel required", cls: "bg-red-100 text-red-700" },
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  published: "bg-emerald-100 text-emerald-700",
  pulled: "bg-red-100 text-red-600",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "Unscheduled";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function SocialReview({ initialSlots }: { initialSlots: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Only drafted (has body) posts that are still pending a decision are reviewable.
  const reviewable = slots.filter((s) => s.body && (s.status === "draft" || s.status === "reviewed"));
  const decided = slots.filter((s) => ["approved", "scheduled", "published", "pulled"].includes(s.status));

  const approvedCount = slots.filter((s) => s.status === "approved").length;
  const isRed = (s: Slot) => s.classification === "red";
  // RED posts can't be bulk-approved here (need counsel), so exclude from "select all".
  const selectableForApprove = reviewable.filter((s) => !isRed(s));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(selectableForApprove.map((s) => s.id)));
  const clearSel = () => setSelected(new Set());

  const bulk = async (decision: "approved" | "rejected") => {
    if (!selected.size) return;
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/social/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", decision, ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed.");
      setSlots(data.slots ?? []);
      clearSel();
      const skipped = (data.skipped ?? []).length;
      if (decision === "approved") {
        const scheduled = data.scheduled ?? 0;
        const tail = data.scheduleNote
          ? ` ${data.scheduleNote}` // e.g. quiet mode is on
          : scheduled > 0
            ? ` ${scheduled} sent to your channels — track them on the posting dashboard →`
            : "";
        setMsg(`Approved ${data.approved}${skipped ? ` · ${skipped} skipped (see badges)` : ""}.${tail}`);
      } else {
        setMsg(`Rejected ${data.rejected}${skipped ? ` · ${skipped} skipped (see badges)` : ""}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Hand every approved post to Ayrshare at its slot time (disclosures appended
  // server-side in the publish path). Quiet mode blocks this server-side.
  const scheduleApproved = async () => {
    setBusy(true); setError(""); setMsg("");
    try {
      const res = await fetch("/api/social/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't schedule.");
      setSlots(data.slots ?? []);
      const failed = (data.failed ?? []).length;
      setMsg(`Scheduled ${data.scheduled} post${data.scheduled === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}. Track delivery on the posting dashboard →`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (id: string) => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/social/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", id, body: editText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setSlots(data.slots ?? []);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (!slots.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm text-gray-600">
        No calendar yet. <a href="/social" className="text-indigo-600">Generate one</a> first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <a href="/social/outbox" className="text-sm text-indigo-600">Posting dashboard →</a>
      </div>

      {/* Bulk action bar */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <span className="text-sm font-medium text-gray-700">{selected.size} selected</span>
        <button onClick={selectAll} className="rounded border border-gray-300 px-2 py-1 text-xs">Select all approvable</button>
        <button onClick={clearSel} className="rounded border border-gray-300 px-2 py-1 text-xs">Clear</button>
        <div className="ml-auto flex gap-2">
          <button disabled={busy || !selected.size} onClick={() => bulk("rejected")} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50">Reject selected</button>
          <button disabled={busy || !selected.size} onClick={() => bulk("approved")} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Working…" : "Approve selected"}
          </button>
          {approvedCount > 0 && (
            <button disabled={busy} onClick={scheduleApproved} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Working…" : `Schedule ${approvedCount} approved →`}
            </button>
          )}
        </div>
      </div>
      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Pending review */}
      {reviewable.length > 0 && <h3 className="text-sm font-semibold text-gray-500">Pending your review ({reviewable.length})</h3>}
      {reviewable.map((s) => {
        const badge = s.classification ? CLASS_BADGE[s.classification] : null;
        return (
          <div key={s.id} className={`rounded-xl border bg-white p-4 ${selected.has(s.id) ? "border-indigo-400 ring-1 ring-indigo-200" : "border-gray-200"}`}>
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.has(s.id)}
                disabled={isRed(s)}
                onChange={() => toggle(s.id)}
                title={isRed(s) ? "RED posts need counsel sign-off — can't bulk-approve here" : ""}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-gray-700">{PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{fmtDate(s.scheduledAt)}</span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-500">{s.theme}</span>
                  {badge && <span className={`rounded px-1.5 py-0.5 ${badge.cls}`}>{badge.label}</span>}
                </div>

                {editing === s.id ? (
                  <div className="mt-2">
                    <textarea className="w-full rounded-lg border border-gray-300 p-2 text-sm" rows={5} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <div className="mt-1 flex gap-2">
                      <button disabled={busy} onClick={() => saveEdit(s.id)} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white">Save</button>
                      <button onClick={() => setEditing(null)} className="rounded border border-gray-300 px-3 py-1 text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{s.body}</p>
                )}

                {s.classFlags?.length > 0 && (
                  <p className="mt-2 text-xs text-red-600">⚠ Compliance flags: {s.classFlags.join(", ")}</p>
                )}

                <div className="mt-2 flex gap-3 text-xs">
                  {editing !== s.id && (
                    <button onClick={() => { setEditing(s.id); setEditText(s.body); }} className="text-indigo-600">Edit</button>
                  )}
                </div>
              </div>

              {s.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.mediaUrl} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
              )}
            </div>
          </div>
        );
      })}

      {/* Already decided */}
      {decided.length > 0 && (
        <>
          <h3 className="pt-2 text-sm font-semibold text-gray-500">Decided ({decided.length})</h3>
          {decided.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-gray-600">{PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-500">{fmtDate(s.scheduledAt)}</span>
                <span className={`ml-auto rounded px-1.5 py-0.5 ${STATUS_BADGE[s.status] ?? "bg-gray-100 text-gray-600"}`}>{s.status}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-600">{s.body}</p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

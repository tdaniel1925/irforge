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
}

const PLATFORM_LABEL: Record<string, string> = {
  twitter: "X", linkedin: "LinkedIn", facebook: "FB", instagram: "IG",
  youtube: "YouTube", tiktok: "TikTok", telegram: "TG", reddit: "Reddit",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  scheduled: "bg-indigo-100 text-indigo-700",
  published: "bg-emerald-100 text-emerald-700",
};

function dayKey(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SocialCalendar({ initialSlots, hasStrategy }: { initialSlots: Slot[]; hasStrategy: boolean }) {
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [weeks, setWeeks] = useState(4);

  const generate = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/social/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't generate the calendar.");
      setSlots(data.slots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  // Group slots by day for the grid.
  const byDay = slots.reduce<Record<string, Slot[]>>((acc, s) => {
    const k = dayKey(s.scheduledAt);
    (acc[k] ??= []).push(s);
    return acc;
  }, {});
  const days = Object.keys(byDay);
  const draftCount = slots.filter((s) => !s.body).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your content calendar</h2>
          <p className="mt-1 text-sm text-gray-600">
            {slots.length ? `${slots.length} posts planned across ${days.length} days.` : "Generate a month of posts from your strategy + filings."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Weeks
            <select className="ml-1 rounded border border-gray-300 p-1 text-sm" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[1, 2, 4, 6].map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <button disabled={busy || !hasStrategy} onClick={generate} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Planning…" : slots.length ? "Regenerate" : "Generate calendar"}
          </button>
        </div>
      </div>

      {!hasStrategy && <p className="mt-3 text-sm text-amber-600">Save your strategy above first.</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {slots.length > 0 && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {days.map((day) => (
              <div key={day} className="rounded-lg border border-gray-200 p-2">
                <div className="text-xs font-semibold text-gray-500">{day}</div>
                <div className="mt-1 space-y-1">
                  {byDay[day].map((s) => (
                    <div key={s.id} className="rounded bg-gray-50 p-1.5 text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-gray-700">{PLATFORM_LABEL[s.platform] ?? s.platform}</span>
                        <span className={`rounded px-1 ${STATUS_STYLE[s.status] ?? "bg-gray-100 text-gray-600"}`}>{s.body ? s.status : "empty"}</span>
                      </div>
                      <div className="mt-0.5 truncate text-gray-500" title={s.theme}>{s.theme}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-800">Next: draft &amp; review</p>
            <p className="mt-1">
              {draftCount > 0
                ? `${draftCount} slots still need their post written. The AI will draft each one (with an image) and run it through the compliance check, then you review and approve in bulk.`
                : "All slots drafted — head to bulk review to approve."}
              {" "}(Coming in the next step.)
            </p>
          </div>
        </>
      )}
    </div>
  );
}

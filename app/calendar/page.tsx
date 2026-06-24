"use client";

import { useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Banner, Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import type { Notice } from "@/components/ui";
import type { CalendarEvent } from "@/lib/types";

const TYPE_STYLE: Record<string, { label: string; chip: string }> = {
  earnings: { label: "Earnings", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  filing_deadline: { label: "Filing deadline", chip: "bg-sky-500/15 text-sky-600 dark:text-sky-300" },
  conference: { label: "Conference", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-300" },
  lockup: { label: "Lock-up", chip: "bg-orange-500/15 text-orange-600 dark:text-orange-300" },
  quiet_start: { label: "Quiet period", chip: "bg-red-500/15 text-red-600 dark:text-red-300" },
  quiet_end: { label: "Quiet ends", chip: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300" },
  holiday: { label: "Holiday", chip: "bg-rose-500/15 text-rose-600 dark:text-rose-300" },
  presentation: { label: "Presentation", chip: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
  follow_up_call: { label: "Follow-up call", chip: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300" },
  onboarding_session: { label: "Onboarding session", chip: "bg-teal-500/15 text-teal-600 dark:text-teal-300" },
  team_meeting: { label: "Team meeting", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  reminder: { label: "Reminder", chip: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-300" },
  custom: { label: "Event", chip: "bg-slate-500/15 text-faint" },
};

export default function CalendarPage() {
  const { db, error, refresh } = useAppState();
  const [notice, setNotice] = useState<Notice>(null);
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("custom");

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const events: CalendarEvent[] = [...db.calendar].sort((a, b) => a.date.localeCompare(b.date));
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today);
  const past = events.filter((e) => e.date < today).reverse();

  const add = async () => {
    setNotice(null);
    const res = await fetch("/api/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, title, type }) });
    const data = await res.json();
    if (!res.ok) setNotice({ text: data.error ?? "Failed.", tone: "error" });
    else { setNotice({ text: "Added.", tone: "success" }); setDate(""); setTitle(""); setType("custom"); await refresh(); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this event from your calendar?")) return;
    setNotice(null);
    try {
      const res = await fetch(`/api/calendar?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setNotice({ text: data.error ?? "Couldn't remove that event.", tone: "error" });
        return;
      }
      await refresh();
    } catch {
      setNotice({ text: "Network error.", tone: "error" });
    }
  };

  const Row = ({ e }: { e: CalendarEvent }) => {
    const s = TYPE_STYLE[e.type] ?? TYPE_STYLE.custom;
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-app bg-surface px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="w-24 shrink-0 text-sm font-medium text-app">{new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${s.chip}`}>{s.label}</span>
              <span className="text-sm text-app">{e.title}</span>
            </div>
            {e.note && <p className="mt-0.5 text-xs text-muted">{e.note}</p>}
          </div>
        </div>
        {e.type !== "quiet_start" && e.type !== "quiet_end" && (
          <button onClick={() => remove(e.id)} className="text-xs text-faint hover:text-red-500">remove</button>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="IR Calendar" subtitle="Your earnings dates, filing deadlines, conferences, lock-ups, meetings, and reminders in one place. Set a quiet period whenever you need one to lock publishing during a blackout." />
      {notice && <Banner message={notice.text} tone={notice.tone} onDismiss={() => setNotice(null)} />}

      <Card className="mb-6">
        <p className="mb-3 text-sm font-medium text-app">Add an event</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none sm:col-span-2" />
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
            <option value="custom">Event</option>
            <option value="earnings">Earnings</option>
            <option value="filing_deadline">Filing deadline</option>
            <option value="conference">Conference</option>
            <option value="lockup">Lock-up</option>
            <option value="holiday">Holiday</option>
            <option value="presentation">Presentation</option>
            <option value="follow_up_call">Follow-up call</option>
            <option value="onboarding_session">Onboarding session</option>
            <option value="team_meeting">Team meeting</option>
            <option value="reminder">Reminder</option>
          </select>
        </div>
        <div className="mt-3"><Button onClick={add} disabled={!date || !title}>Add to calendar</Button></div>
      </Card>

      {upcoming.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-app">Upcoming</h2>
          <div className="space-y-2">{upcoming.map((e) => <Row key={e.id} e={e} />)}</div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-faint">Past</h2>
          <div className="space-y-2 opacity-70">{past.map((e) => <Row key={e.id} e={e} />)}</div>
        </div>
      )}
      {events.length === 0 && <Card className="border-dashed"><p className="py-8 text-center text-sm text-faint">No events yet — add your next earnings date to start.</p></Card>}
    </div>
  );
}

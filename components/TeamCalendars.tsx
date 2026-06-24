"use client";

import { useEffect, useMemo, useState } from "react";

interface Cal { id: string; kind: string; name: string; color: string; ownerUserId: string | null }
interface Ev { id: string; calendarId: string; title: string; eventDate: string; eventTime: string; type: string; note: string }
interface Member { id: string; userId: string | null; email: string; role: string }

const COLOR: Record<string, string> = {
  emerald: "bg-emerald-500", sky: "bg-sky-500", violet: "bg-violet-500",
  amber: "bg-amber-500", rose: "bg-rose-500", cyan: "bg-cyan-500", slate: "bg-slate-500",
};
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

export default function TeamCalendars({ initialCalendars, isAdmin }: { initialCalendars: Cal[]; isAdmin: boolean }) {
  const [calendars] = useState<Cal[]>(initialCalendars);
  const [events, setEvents] = useState<Ev[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set()); // calendar ids toggled off
  const [view, setView] = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [createFor, setCreateFor] = useState<string | null>(null);
  const [manageCal, setManageCal] = useState<Cal | null>(null);

  const range = useMemo(() => ({ start: new Date(view.y, view.m, 1), end: new Date(view.y, view.m + 1, 1) }), [view]);

  const load = async () => {
    const qs = new URLSearchParams({ from: ymd(range.start), to: ymd(range.end) });
    const res = await fetch(`/api/calendars?${qs}`);
    const data = await res.json();
    if (res.ok) setEvents(data.events ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [view]);

  const calById = useMemo(() => Object.fromEntries(calendars.map((c) => [c.id, c])), [calendars]);
  const visibleEvents = events.filter((e) => !hidden.has(e.calendarId));

  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(view.y, view.m, d));
    while (out.length % 7) out.push(null);
    return out;
  }, [view]);

  const byDay = useMemo(() => {
    const m: Record<string, Ev[]> = {};
    for (const e of visibleEvents) (m[e.eventDate] ??= []).push(e);
    return m;
  }, [visibleEvents]);

  const shift = (by: number) => { const d = new Date(view.y, view.m + by, 1); setView({ y: d.getFullYear(), m: d.getMonth() }); };
  const todayKey = ymd(new Date());
  const monthLabel = range.start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      {/* Calendar filters + admin manage */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {calendars.map((c) => {
          const off = hidden.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => setHidden((h) => { const n = new Set(h); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${off ? "border-app text-faint" : "border-app text-app"}`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${COLOR[c.color] ?? "bg-slate-500"} ${off ? "opacity-30" : ""}`} />
              {c.name}
              {isAdmin && c.kind !== "personal" && (
                <span onClick={(e) => { e.stopPropagation(); setManageCal(c); }} className="ml-1 text-xs text-muted hover:text-app" title="Manage who sees this">⚙</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Month nav */}
      <div className="mb-2 flex items-center gap-2">
        <button onClick={() => shift(-1)} className="rounded-lg border border-app px-2.5 py-1 text-sm">←</button>
        <h2 className="min-w-[10rem] text-center text-lg font-semibold text-app">{monthLabel}</h2>
        <button onClick={() => shift(1)} className="rounded-lg border border-app px-2.5 py-1 text-sm">→</button>
        <button onClick={() => { const n = new Date(); setView({ y: n.getFullYear(), m: n.getMonth() }); }} className="ml-1 rounded-lg border border-app px-2.5 py-1 text-xs">Today</button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-faint">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg bg-app/40 p-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[88px] bg-surface/30" />;
          const key = ymd(d);
          const dayEvents = byDay[key] ?? [];
          return (
            <div key={i} className="group min-h-[88px] cursor-pointer bg-surface p-1.5 transition hover:bg-app-hover" onClick={() => setCreateFor(key)} title="Click to add an event">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${key === todayKey ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 font-bold text-white" : "text-muted"}`}>{d.getDate()}</span>
                <span className="opacity-0 transition group-hover:opacity-100 text-xs text-emerald-600">＋</span>
              </div>
              {dayEvents.slice(0, 3).map((e) => {
                const c = calById[e.calendarId];
                return (
                  <div key={e.id} className="mt-1 flex items-center gap-1 truncate rounded bg-app/60 px-1 py-0.5 text-[10px] text-app" title={`${c?.name ?? ""}: ${e.title}${e.note ? ` — ${e.note}` : ""}`}>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLOR[c?.color ?? "slate"]}`} />
                    <span className="truncate">{e.eventTime ? `${e.eventTime} ` : ""}{e.title}</span>
                  </div>
                );
              })}
              {dayEvents.length > 3 && <div className="mt-0.5 text-[10px] text-faint">+{dayEvents.length - 3}</div>}
            </div>
          );
        })}
      </div>

      {createFor && <AddEventModal date={createFor} calendars={calendars.filter((c) => !c.ownerUserId || true)} onClose={() => setCreateFor(null)} onAdded={() => { setCreateFor(null); load(); }} />}
      {manageCal && <ManageAccessModal cal={manageCal} onClose={() => setManageCal(null)} />}
    </div>
  );
}

function AddEventModal({ date, calendars, onClose, onAdded }: { date: string; calendars: Cal[]; onClose: () => void; onAdded: () => void }) {
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [type, setType] = useState("custom");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const day = new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const add = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/calendars", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId, title, eventDate: date, eventTime: time, type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add.");
      onAdded();
    } catch (e) { setError(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Add event · ${day}`} onClose={onClose}>
      <div className="space-y-3">
        <input className="w-full rounded-lg border border-app bg-surface-2 p-2 text-sm text-app" placeholder="Event title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-2 text-sm text-muted">Calendar
            <select className="mt-1 w-full rounded border border-app bg-surface-2 p-1.5 text-sm" value={calendarId} onChange={(e) => setCalendarId(e.target.value)}>
              {calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-muted">Time
            <input type="time" className="mt-1 w-full rounded border border-app bg-surface-2 p-1.5 text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <label className="block text-sm text-muted">Type
          <select className="mt-1 w-full rounded border border-app bg-surface-2 p-1.5 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
            {["custom", "meeting", "team_meeting", "reminder", "holiday", "presentation", "follow_up_call", "onboarding_session", "earnings"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-app px-3 py-1.5 text-sm">Cancel</button>
        <button disabled={busy || !title.trim() || !calendarId} onClick={add} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Adding…" : "Add event"}</button>
      </div>
    </Modal>
  );
}

function ManageAccessModal({ cal, onClose }: { cal: Cal; onClose: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/calendars/access?calendarId=${cal.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.members) { setMembers(d.members); setGranted(new Set(d.access ?? [])); } })
      .catch(() => {});
  }, [cal.id]);

  const toggle = (uid: string) => setGranted((g) => { const n = new Set(g); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/calendars/access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId: cal.id, userIds: Array.from(granted) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't save.");
      setMsg("Saved ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Who can see "${cal.name}"`} onClose={onClose}>
      <p className="mb-2 text-xs text-muted">General calendars are visible to everyone. For other calendars, pick who can see this one. (Admins always see all.)</p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {members.filter((m) => m.userId).map((m) => (
          <label key={m.userId} className="flex items-center gap-2 rounded px-1 py-1 text-sm text-app hover:bg-app-hover">
            <input type="checkbox" checked={granted.has(m.userId!)} onChange={() => toggle(m.userId!)} />
            {m.email} <span className="text-xs text-faint">({m.role})</span>
          </label>
        ))}
        {!members.length && <p className="text-sm text-faint">No teammates yet.</p>}
      </div>
      {msg && <p className="mt-2 text-sm text-green-600">{msg}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-app px-3 py-1.5 text-sm">Close</button>
        <button disabled={busy} onClick={save} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Save access"}</button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-app bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-app">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-app">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";

interface Profile { userId: string; displayName: string; email: string; officeStatus: "in" | "out"; statusReason: string; birthday: string | null }
interface Update { id: string; authorName: string; body: string; createdAt: string; mine: boolean }
interface Cal { id: string; kind: string; name: string; color: string }
interface Ev { id: string; calendarId: string; title: string; eventDate: string; eventTime: string; type: string }
interface Quote { price: number; changePct: number }

const COLOR: Record<string, string> = { emerald: "bg-emerald-500", sky: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500", cyan: "bg-cyan-500", slate: "bg-slate-500" };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function HomeDashboard(props: {
  companyName: string; ticker: string; quote: string; birthdays: string[];
  initialProfiles: Profile[]; initialUpdates: Update[];
  calendars: Cal[]; events: Ev[]; quotes: Record<string, Quote>;
}) {
  const [profiles, setProfiles] = useState<Profile[]>(props.initialProfiles);
  const [updates, setUpdates] = useState<Update[]>(props.initialUpdates);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // Inline "Out" reason flow (replaces a native prompt()).
  const [outOpen, setOutOpen] = useState(false);
  const [outReason, setOutReason] = useState("");

  const calById = Object.fromEntries(props.calendars.map((c) => [c.id, c]));
  const today = todayKey();
  const todays = props.events.filter((e) => e.eventDate === today).sort((a, b) => (a.eventTime || "99").localeCompare(b.eventTime || "99"));
  const upcoming = props.events.filter((e) => e.eventDate > today).slice(0, 5);

  const inOffice = profiles.filter((p) => p.officeStatus === "in");
  const outOffice = profiles.filter((p) => p.officeStatus === "out");

  const setStatus = async (status: "in" | "out", reason = "") => {
    setProfiles((ps) => ps); // optimistic handled by refetch
    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officeStatus: status, statusReason: reason }) });
    const d = await res.json();
    if (res.ok && d.profiles) setProfiles(d.profiles);
  };

  const postUpdate = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", body: draft, authorName: props.companyName ? "" : "" }) });
    const d = await res.json();
    if (res.ok && d.updates) { setUpdates(d.updates); setDraft(""); }
    setBusy(false);
  };
  const deleteUpdate = async (id: string) => {
    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteUpdate", id }) });
    const d = await res.json();
    if (res.ok && d.updates) setUpdates(d.updates);
  };

  return (
    <div className="space-y-5">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-app">{greeting()} 👋</h1>
        <p className="mt-1 text-sm text-muted">{props.companyName} {props.ticker ? `· $${props.ticker}` : ""} — here&apos;s your day.</p>
      </div>

      {/* Birthday banner */}
      {props.birthdays.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          🎂 Happy birthday to {props.birthdays.join(", ")}!
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* LEFT: agenda */}
        <div className="space-y-5 lg:col-span-2">
          {/* Today's agenda */}
          <Card title="Today">
            {todays.length === 0 ? (
              <p className="text-sm text-muted">Nothing scheduled today.</p>
            ) : (
              <ul className="space-y-1.5">
                {todays.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 rounded-full ${COLOR[calById[e.calendarId]?.color ?? "slate"]}`} />
                    <span className="w-14 shrink-0 text-xs text-faint">{e.eventTime || "—"}</span>
                    <span className="text-app">{e.title}</span>
                    <span className="text-xs text-faint">· {calById[e.calendarId]?.name}</span>
                  </li>
                ))}
              </ul>
            )}
            {upcoming.length > 0 && (
              <>
                <p className="mt-4 mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Coming up</p>
                <ul className="space-y-1">
                  {upcoming.map((e) => (
                    <li key={e.id} className="flex items-center gap-2 text-xs text-muted">
                      <span className="w-16 shrink-0 text-faint">{new Date(e.eventDate + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${COLOR[calById[e.calendarId]?.color ?? "slate"]}`} />
                      {e.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Link href="/calendars" className="mt-3 inline-block text-xs text-emerald-600">Open team calendars →</Link>
          </Card>

          {/* Team quick-update board */}
          <Card title="Team updates">
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app"
                placeholder="Quick update for the team… (e.g. meeting at 11, won't respond)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && postUpdate()}
              />
              <button disabled={busy || !draft.trim()} onClick={postUpdate} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Post</button>
            </div>
            <ul className="mt-3 space-y-2">
              {updates.length === 0 && <li className="text-sm text-muted">No updates yet. Post the first one.</li>}
              {updates.map((u) => (
                <li key={u.id} className="group flex items-start gap-2 rounded-lg bg-app/40 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-app">{u.authorName}</span>
                    <span className="ml-2 text-xs text-faint">{timeAgo(u.createdAt)}</span>
                    <p className="text-app">{u.body}</p>
                  </div>
                  {u.mine && <button onClick={() => deleteUpdate(u.id)} className="text-xs text-faint opacity-0 transition group-hover:opacity-100 hover:text-red-500">✕</button>}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* RIGHT: status, presence, widgets */}
        <div className="space-y-5">
          {/* My status */}
          <Card title="Your status">
            <div className="flex gap-2">
              <button onClick={() => { setOutOpen(false); setStatus("in"); }} className="flex-1 rounded-lg bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">🟢 In office</button>
              <button onClick={() => setOutOpen((o) => !o)} className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">🌴 Out</button>
            </div>
            {/* Inline reason — no native prompt. */}
            {outOpen && (
              <div className="mt-2 space-y-2">
                <input
                  autoFocus
                  value={outReason}
                  onChange={(e) => setOutReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setStatus("out", outReason); setOutOpen(false); setOutReason(""); } }}
                  placeholder="Reason (optional) — e.g. at a wedding"
                  className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-amber-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => { setStatus("out", outReason); setOutOpen(false); setOutReason(""); }} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white">Set out</button>
                  <button onClick={() => { setOutOpen(false); setOutReason(""); }} className="rounded-lg border border-app px-3 py-1.5 text-sm">Cancel</button>
                </div>
              </div>
            )}
          </Card>

          {/* Who's in / out */}
          <Card title="Who's around">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">In office ({inOffice.length})</p>
            <ul className="mt-1 space-y-0.5">
              {inOffice.map((p) => <li key={p.userId} className="text-sm text-app">🟢 {p.displayName}</li>)}
              {!inOffice.length && <li className="text-sm text-faint">—</li>}
            </ul>
            {outOffice.length > 0 && (
              <>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-600">Out ({outOffice.length})</p>
                <ul className="mt-1 space-y-0.5">
                  {outOffice.map((p) => <li key={p.userId} className="text-sm text-muted">🌴 {p.displayName}{p.statusReason ? ` — ${p.statusReason}` : ""}</li>)}
                </ul>
              </>
            )}
          </Card>

          {/* Stock ticker widget */}
          {Object.keys(props.quotes).length > 0 && (
            <Card title="Markets">
              <ul className="space-y-1">
                {Object.entries(props.quotes).map(([t, q]) => (
                  <li key={t} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-app">${t}</span>
                    <span className="text-app">{q.price ? `$${q.price.toFixed(2)}` : "—"}</span>
                    <span className={q.changePct >= 0 ? "text-emerald-600" : "text-red-500"}>{q.changePct >= 0 ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Daily quote */}
          <Card title="Quote of the day">
            <p className="text-sm italic text-muted">“{props.quote}”</p>
          </Card>

          {/* Quick links */}
          <Card title="Jump to">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Link href="/approvals" className="rounded-lg bg-app/40 px-3 py-2 text-app hover:bg-app-hover">✅ Approvals</Link>
              <Link href="/social" className="rounded-lg bg-app/40 px-3 py-2 text-app hover:bg-app-hover">✨ Content Engine</Link>
              <Link href="/social/outbox" className="rounded-lg bg-app/40 px-3 py-2 text-app hover:bg-app-hover">📤 Posting</Link>
              <Link href="/crm" className="rounded-lg bg-app/40 px-3 py-2 text-app hover:bg-app-hover">👥 CRM</Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-app">{title}</h2>
      {children}
    </div>
  );
}

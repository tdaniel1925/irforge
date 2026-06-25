"use client";

import Link from "next/link";
import { useState } from "react";

interface Profile { userId: string; displayName: string; email: string; officeStatus: "in" | "out"; statusReason: string; birthday: string | null }
interface Update { id: string; authorName: string; body: string; createdAt: string; mine: boolean }
interface Cal { id: string; kind: string; name: string; color: string }
interface Ev { id: string; calendarId: string; title: string; eventDate: string; eventTime: string; type: string }
interface Quote { price: number; changePct: number }
interface Approval { id: string; platform: string; theme: string; body: string; classification: string | null }
interface Metrics { postsByStatus: Record<string, number>; classByLevel: Record<string, number>; publishedLast7: number; inboundOpen: number; inboundLast7: number; stakeholders: number; quietActive: boolean }
interface ReadItem { title: string; url: string; source: string; date: string }

const COLOR: Record<string, string> = { emerald: "bg-emerald-500", sky: "bg-sky-500", violet: "bg-violet-500", amber: "bg-amber-500", rose: "bg-rose-500", cyan: "bg-cyan-500", slate: "bg-slate-500" };
const PLAT: Record<string, string> = { twitter: "X", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram" };

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
const longDate = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export default function HomeDashboard(props: {
  companyName: string; ticker: string; quote: string; birthdays: string[];
  initialProfiles: Profile[]; initialUpdates: Update[];
  calendars: Cal[]; events: Ev[]; quotes: Record<string, Quote>;
  approvals: Approval[]; metrics: Metrics | null; morningRead: ReadItem[];
}) {
  const [profiles, setProfiles] = useState<Profile[]>(props.initialProfiles);
  const [updates, setUpdates] = useState<Update[]>(props.initialUpdates);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [outOpen, setOutOpen] = useState(false);
  const [outReason, setOutReason] = useState("");

  const calById = Object.fromEntries(props.calendars.map((c) => [c.id, c]));
  const today = todayKey();
  const todays = props.events.filter((e) => e.eventDate === today).sort((a, b) => (a.eventTime || "99").localeCompare(b.eventTime || "99"));
  const upcoming = props.events.filter((e) => e.eventDate > today).slice(0, 4);
  const inOffice = profiles.filter((p) => p.officeStatus === "in");
  const outOffice = profiles.filter((p) => p.officeStatus === "out");
  const m = props.metrics;

  const setStatus = async (status: "in" | "out", reason = "") => {
    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ officeStatus: status, statusReason: reason }) });
    const d = await res.json();
    if (res.ok && d.profiles) setProfiles(d.profiles);
  };
  const postUpdate = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    const res = await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", body: draft }) });
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
      {/* ── Top banner: date + motivation quote ── */}
      <div className="rounded-2xl border border-app bg-gradient-to-r from-emerald-500/10 via-surface to-sky-500/10 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{longDate}</p>
        <h1 className="mt-1 text-2xl font-bold text-app">{greeting()} 👋</h1>
        <p className="mt-1 text-sm italic text-muted">“{props.quote}”</p>
        {props.birthdays.length > 0 && <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">🎂 Happy birthday to {props.birthdays.join(", ")}!</p>}
      </div>

      {/* ── HERO: today's posts to approve ── */}
      <Link href="/social/review" className="block rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 transition hover:border-emerald-500/60 hover:shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Today&apos;s posts to approve</p>
            <h2 className="mt-0.5 text-3xl font-bold text-app">{props.approvals.length}{props.approvals.length === 6 ? "+" : ""} <span className="text-base font-medium text-muted">{props.approvals.length === 1 ? "post" : "posts"} waiting</span></h2>
          </div>
          <span className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white">Review &amp; approve →</span>
        </div>
        {props.approvals.length > 0 ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {props.approvals.slice(0, 3).map((a) => (
              <div key={a.id} className="rounded-lg bg-surface p-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-app">{PLAT[a.platform] ?? a.platform}</span>
                  {a.classification && <span className={`rounded px-1 ${a.classification === "red" ? "bg-red-500/15 text-red-600" : a.classification === "yellow" ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600"}`}>{a.classification}</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-muted">{a.body}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing waiting. Generate a calendar in the Content Engine to get posts flowing.</p>
        )}
      </Link>

      {/* ── Symmetric widget grid ── */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">

        {/* Intelligence stats (folded in) */}
        <Card title="Your IR at a glance" href="/intelligence">
          {m ? (
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Published (7d)" value={m.publishedLast7} />
              <Stat label="Awaiting approval" value={(m.postsByStatus.draft ?? 0) + (m.postsByStatus.reviewed ?? 0)} />
              <Stat label="Inbound open" value={m.inboundOpen} />
              <Stat label="Stakeholders" value={m.stakeholders} />
              <Stat label="🟢 Green / 🟡 Yellow / 🔴 Red" value={`${m.classByLevel.green ?? 0}/${m.classByLevel.yellow ?? 0}/${m.classByLevel.red ?? 0}`} wide />
              {m.quietActive && <p className="col-span-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-600">🔇 Quiet period active — publishing paused.</p>}
            </div>
          ) : <p className="text-sm text-muted">No analytics yet.</p>}
        </Card>

        {/* Morning read (news) */}
        <Card title="Morning read 📰">
          {props.morningRead.length ? (
            <ul className="space-y-2">
              {props.morningRead.map((r, i) => (
                <li key={i}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-app hover:text-emerald-600">{r.title}</a>
                  <span className="block text-[11px] text-faint">{r.source}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">No recent coverage found for ${props.ticker}. Check back tomorrow.</p>}
        </Card>

        {/* Today's agenda */}
        <Card title="Today" href="/calendars">
          {todays.length === 0 ? <p className="text-sm text-muted">Nothing scheduled today.</p> : (
            <ul className="space-y-1.5">
              {todays.map((e) => (
                <li key={e.id} className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${COLOR[calById[e.calendarId]?.color ?? "slate"]}`} />
                  <span className="w-12 shrink-0 text-xs text-faint">{e.eventTime || "—"}</span>
                  <span className="truncate text-app">{e.title}</span>
                </li>
              ))}
            </ul>
          )}
          {upcoming.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Coming up</p>
              <ul className="space-y-1">
                {upcoming.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 text-xs text-muted">
                    <span className="w-14 shrink-0 text-faint">{new Date(e.eventDate + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <span className="truncate">{e.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        {/* Team updates */}
        <Card title="Team updates">
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app" placeholder="Quick update… (e.g. meeting at 11)" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postUpdate()} />
            <button disabled={busy || !draft.trim()} onClick={postUpdate} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Post</button>
          </div>
          <ul className="mt-3 space-y-2">
            {updates.length === 0 && <li className="text-sm text-muted">No updates yet.</li>}
            {updates.slice(0, 5).map((u) => (
              <li key={u.id} className="group flex items-start gap-2 rounded-lg bg-app/40 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-app">{u.authorName}</span><span className="ml-2 text-xs text-faint">{timeAgo(u.createdAt)}</span>
                  <p className="text-app">{u.body}</p>
                </div>
                {u.mine && <button onClick={() => deleteUpdate(u.id)} className="text-xs text-faint opacity-0 transition group-hover:opacity-100 hover:text-red-500">✕</button>}
              </li>
            ))}
          </ul>
        </Card>

        {/* Who's around + your status */}
        <Card title="Who's around">
          <div className="mb-3 flex gap-2">
            <button onClick={() => { setOutOpen(false); setStatus("in"); }} className="flex-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">🟢 I&apos;m in</button>
            <button onClick={() => setOutOpen((o) => !o)} className="flex-1 rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">🌴 I&apos;m out</button>
          </div>
          {outOpen && (
            <div className="mb-3 space-y-2">
              <input autoFocus value={outReason} onChange={(e) => setOutReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setStatus("out", outReason); setOutOpen(false); setOutReason(""); } }} placeholder="Reason (optional) — e.g. at a wedding" className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app" />
              <div className="flex gap-2">
                <button onClick={() => { setStatus("out", outReason); setOutOpen(false); setOutReason(""); }} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-medium text-white">Set out</button>
                <button onClick={() => { setOutOpen(false); setOutReason(""); }} className="rounded-lg border border-app px-3 py-1 text-xs">Cancel</button>
              </div>
            </div>
          )}
          <ul className="space-y-0.5">
            {inOffice.map((p) => <li key={p.userId} className="text-sm text-app">🟢 {p.displayName}</li>)}
            {outOffice.map((p) => <li key={p.userId} className="text-sm text-muted">🌴 {p.displayName}{p.statusReason ? ` — ${p.statusReason}` : ""}</li>)}
            {!profiles.length && <li className="text-sm text-faint">Set your status above.</li>}
          </ul>
        </Card>

        {/* Markets */}
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
      </div>
    </div>
  );
}

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-app bg-surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-app">{title}</h2>
        {href && <Link href={href} className="text-xs text-emerald-600">Open →</Link>}
      </div>
      {children}
    </div>
  );
}
function Stat({ label, value, wide }: { label: string; value: number | string; wide?: boolean }) {
  return (
    <div className={`rounded-lg bg-app/40 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <div className="text-lg font-bold text-app">{value}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  );
}

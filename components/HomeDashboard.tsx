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
interface Podcast { title: string; url: string; show: string; date: string }

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
  approvals: Approval[]; metrics: Metrics | null; morningRead: ReadItem[]; podcast: Podcast | null;
  layout: { order: string[]; hidden: string[] } | null;
}) {
  // ── Per-user widget customization ──
  // 'updates' + 'around' removed — they duplicated the always-on right-rail team
  // chat + who's-in/out (CommsSidebar). The rail is the single home for team comms.
  const DEFAULT_ORDER = ["intel", "read", "agenda", "markets"];
  const WIDGET_LABELS: Record<string, string> = { intel: "IR at a glance", read: "Morning read", agenda: "Today's agenda", markets: "Markets" };
  const [customizing, setCustomizing] = useState(false);
  const [order, setOrder] = useState<string[]>(() => {
    const saved = props.layout?.order?.filter((id) => DEFAULT_ORDER.includes(id)) ?? [];
    // Saved order first, then any new widgets not in it, deduped.
    return Array.from(new Set([...saved, ...DEFAULT_ORDER]));
  });
  const [hidden, setHidden] = useState<Set<string>>(new Set(props.layout?.hidden ?? []));

  const move = (id: string, dir: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(id); const j = i + dir;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
  };
  const toggleHidden = (id: string) => setHidden((h) => { const n = new Set(h); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const saveLayout = async () => {
    await fetch("/api/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "layout", order, hidden: Array.from(hidden) }) });
    setCustomizing(false);
  };

  const calById = Object.fromEntries(props.calendars.map((c) => [c.id, c]));
  const today = todayKey();
  const todays = props.events.filter((e) => e.eventDate === today).sort((a, b) => (a.eventTime || "99").localeCompare(b.eventTime || "99"));
  const upcoming = props.events.filter((e) => e.eventDate > today).slice(0, 4);
  const m = props.metrics;

  // Each customizable widget's JSX, keyed by id (rendered per the saved order).
  const widgets: Record<string, React.ReactNode> = {
    intel: (
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
    ),
    read: (
      <Card title="Morning read 📰">
        {props.podcast && (
          <a href={props.podcast.url} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-start gap-2 rounded-lg bg-app/40 p-2 hover:bg-app-hover">
            <span className="text-lg">🎧</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-app">{props.podcast.title}</span>
              <span className="block text-[11px] text-faint">{props.podcast.show} · listen</span>
            </span>
          </a>
        )}
        {props.morningRead.length ? (
          <ul className="space-y-2">
            {props.morningRead.map((r, i) => (
              <li key={i}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm text-app hover:text-emerald-600">{r.title}</a>
                <span className="block text-[11px] text-faint">{r.source}</span>
              </li>
            ))}
          </ul>
        ) : !props.podcast ? <p className="text-sm text-muted">No recent coverage found for ${props.ticker?.toUpperCase() ?? ""}. Check back tomorrow.</p> : null}
      </Card>
    ),
    agenda: (
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
    ),
    markets: Object.keys(props.quotes).length > 0 ? (
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
    ) : null,
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

      {/* ── Customize toolbar ── */}
      <div className="flex justify-end">
        {customizing ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Toggle, reorder, then</span>
            <button onClick={saveLayout} className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white">Save layout</button>
            <button onClick={() => setCustomizing(false)} className="rounded-lg border border-app px-3 py-1">Done</button>
          </div>
        ) : (
          <button onClick={() => setCustomizing(true)} className="rounded-lg border border-app px-3 py-1 text-sm text-muted hover:text-app">⚙ Customize</button>
        )}
      </div>

      {/* ── Customizable widget grid ── */}
      {/* auto-rows-fr keeps cards in the same row equal height so a tall card no
          longer leaves big empty gaps next to short ones. */}
      <div className="grid auto-rows-fr gap-5 md:grid-cols-2 lg:grid-cols-3">
        {order.map((id) => {
          const isHidden = hidden.has(id);
          // In normal mode, skip hidden widgets entirely. In customize mode, show
          // them dimmed so they can be toggled back on.
          if (isHidden && !customizing) return null;
          const body = widgets[id];
          if (!body) return null;
          return (
            <div key={id} className={`relative h-full ${isHidden ? "opacity-40" : ""}`}>
              {customizing && (
                <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-app bg-surface px-1 py-0.5 text-xs">
                  <button onClick={() => move(id, -1)} className="px-1 text-muted hover:text-app" title="Move up">↑</button>
                  <button onClick={() => move(id, 1)} className="px-1 text-muted hover:text-app" title="Move down">↓</button>
                  <button onClick={() => toggleHidden(id)} className="px-1 text-muted hover:text-app" title={isHidden ? "Show" : "Hide"}>{isHidden ? "👁" : "🚫"}</button>
                </div>
              )}
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-app bg-surface p-4">
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

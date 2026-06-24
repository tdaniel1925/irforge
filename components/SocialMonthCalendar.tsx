"use client";

import { useEffect, useMemo, useState } from "react";

interface Post {
  id: string;
  platform: string;
  theme: string;
  body: string;
  status: string;
  classification: string | null;
  scheduledAt: string | null;
  mediaUrl: string;
  postUrl: string;
  manual: boolean;
}
interface IrEvent { date: string; title: string; type: string }
type QuietWindow = [string, string | null];

const PLATFORMS = [
  { key: "twitter", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
];

// Post status → chip color.
const STATUS_DOT: Record<string, string> = {
  draft: "bg-purple-500",      // pending
  reviewed: "bg-blue-400",
  approved: "bg-emerald-500",
  scheduled: "bg-sky-500",
  published: "bg-teal-600",
  pulled: "bg-gray-400",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Pending", reviewed: "Reviewed", approved: "Approved",
  scheduled: "Scheduled", published: "Posted", pulled: "Pulled",
};

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function SocialMonthCalendar({ year, month }: { year: number; month: number }) {
  // month is 0-indexed. Drive the grid off a viewed year/month in state.
  const [view, setView] = useState({ y: year, m: month });
  const [posts, setPosts] = useState<Post[]>([]);
  const [events, setEvents] = useState<IrEvent[]>([]);
  const [quiet, setQuiet] = useState<QuietWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createFor, setCreateFor] = useState<string | null>(null); // ISO date
  const [openPost, setOpenPost] = useState<Post | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);     // post being dragged
  const [dragOver, setDragOver] = useState<string | null>(null); // day key under cursor
  const [dropError, setDropError] = useState("");

  // Drop a dragged post onto a new day → reschedule (keeps its original time-of-day).
  const onDropDay = async (dayKey: string) => {
    const id = dragId;
    setDragId(null); setDragOver(null);
    if (!id) return;
    const post = posts.find((p) => p.id === id);
    if (!post) return;
    // Preserve the post's existing time-of-day; just move the date.
    const old = post.scheduledAt ? new Date(post.scheduledAt) : new Date();
    const [y, m, d] = dayKey.split("-").map(Number);
    const next = new Date(old);
    next.setFullYear(y, m - 1, d);
    // Optimistic update.
    setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, scheduledAt: next.toISOString() } : p)));
    setDropError("");
    const res = await fetch("/api/social/month", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, scheduledAt: next.toISOString() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setDropError(data.error || "Couldn't move that post.");
      load(); // revert optimistic change
    }
  };

  // Range = first..last day of the viewed month.
  const range = useMemo(() => {
    const start = new Date(view.y, view.m, 1);
    const end = new Date(view.y, view.m + 1, 1);
    return { start, end };
  }, [view]);

  const load = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ start: range.start.toISOString(), end: range.end.toISOString() });
      const res = await fetch(`/api/social/month?${qs}`);
      const data = await res.json();
      if (res.ok) {
        setPosts(data.posts ?? []);
        setEvents(data.events ?? []);
        setQuiet(data.quietWindows ?? []);
      }
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

  // Build the grid cells (leading blanks so day 1 lands on the right weekday).
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7; // Mon=0
    const daysIn = new Date(view.y, view.m + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= daysIn; d++) out.push(new Date(view.y, view.m, d));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [view]);

  const postsByDay = useMemo(() => {
    const map: Record<string, Post[]> = {};
    for (const p of posts) {
      if (!p.scheduledAt) continue;
      const k = ymd(new Date(p.scheduledAt));
      (map[k] ??= []).push(p);
    }
    return map;
  }, [posts]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, IrEvent[]> = {};
    for (const e of events) (map[e.date] ??= []).push(e);
    return map;
  }, [events]);

  const isQuiet = (d: Date) => {
    const t = d.getTime();
    return quiet.some(([s, e]) => t >= new Date(s).getTime() && (e === null || t < new Date(e).getTime()));
  };

  const todayKey = ymd(new Date());
  const monthLabel = range.start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      {/* Header: month nav + legend */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setView((v) => ({ ...v, ...shift(v.y, v.m, -1) }))} className="rounded-lg border border-app px-2.5 py-1 text-sm">←</button>
          <h2 className="min-w-[10rem] text-center text-lg font-semibold text-app">{monthLabel}</h2>
          <button onClick={() => setView((v) => ({ ...v, ...shift(v.y, v.m, 1) }))} className="rounded-lg border border-app px-2.5 py-1 text-sm">→</button>
          <button onClick={() => { const n = new Date(); setView({ y: n.getFullYear(), m: n.getMonth() }); }} className="ml-1 rounded-lg border border-app px-2.5 py-1 text-xs">Today</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {["draft", "approved", "scheduled", "published"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />{STATUS_LABEL[s]}</span>
          ))}
          <span className="inline-flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-red-500/20 ring-1 ring-red-500/40" />Quiet period</span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-faint">
        {DOW.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px rounded-lg bg-app/40 p-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[92px] bg-surface/30" />;
          const key = ymd(d);
          const dayPosts = postsByDay[key] ?? [];
          const dayEvents = eventsByDay[key] ?? [];
          const quietDay = isQuiet(d);
          return (
            <div
              key={i}
              className={`group relative min-h-[92px] cursor-pointer bg-surface p-1.5 transition hover:bg-app-hover ${quietDay ? "ring-1 ring-inset ring-red-500/30" : ""} ${dragOver === key ? "ring-2 ring-inset ring-emerald-500 bg-emerald-500/5" : ""}`}
              onClick={() => setCreateFor(`${key}T15:00:00.000Z`)}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOver(key); } }}
              onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
              onDrop={(e) => { e.preventDefault(); onDropDay(key); }}
              title={quietDay ? "Quiet period — sensitive posts are blocked" : "Click to add a post"}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${key === todayKey ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 font-bold text-white" : "text-muted"}`}>{d.getDate()}</span>
                <span className="opacity-0 transition group-hover:opacity-100 text-xs text-emerald-600">＋</span>
              </div>

              {/* IR event markers */}
              {dayEvents.map((e, j) => (
                <div key={j} className="mt-1 truncate rounded bg-amber-500/15 px-1 py-0.5 text-[10px] text-amber-700 dark:text-amber-300" title={e.title}>
                  {e.type === "earnings" ? "📊 " : e.type.startsWith("quiet") ? "🔇 " : "📌 "}{e.title}
                </div>
              ))}

              {/* Post chips. Movable (drag) only before they're handed to Ayrshare. */}
              {dayPosts.slice(0, 3).map((p) => {
                const movable = p.status !== "scheduled" && p.status !== "published";
                return (
                  <button
                    key={p.id}
                    draggable={movable}
                    onDragStart={() => movable && setDragId(p.id)}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={(ev) => { ev.stopPropagation(); setOpenPost(p); }}
                    className={`mt-1 flex w-full items-center gap-1 truncate rounded bg-app/60 px-1 py-0.5 text-left text-[10px] text-app hover:bg-app ${movable ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === p.id ? "opacity-40" : ""}`}
                    title={movable ? "Drag to reschedule · click to open" : "Already scheduled — pull it first to move"}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[p.status] ?? "bg-gray-400"}`} />
                    <span className="truncate">{platformShort(p.platform)} · {p.theme || "post"}</span>
                  </button>
                );
              })}
              {dayPosts.length > 3 && <div className="mt-0.5 text-[10px] text-faint">+{dayPosts.length - 3} more</div>}
            </div>
          );
        })}
      </div>

      {loading && <p className="mt-2 text-xs text-faint">Loading…</p>}
      {dropError && <p className="mt-2 text-xs text-red-600">{dropError}</p>}
      <p className="mt-2 text-[11px] text-faint">Tip: drag a post to another day to reschedule it (until it&apos;s sent to your channels).</p>

      {createFor && <CreateModal date={createFor} onClose={() => setCreateFor(null)} onCreated={() => { setCreateFor(null); load(); }} />}
      {openPost && <PostModal post={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
}

function shift(y: number, m: number, by: number): { y: number; m: number } {
  const d = new Date(y, m + by, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}
function platformShort(p: string): string {
  return ({ twitter: "X", linkedin: "LI", facebook: "FB", instagram: "IG" } as Record<string, string>)[p] ?? p.slice(0, 2).toUpperCase();
}

// ── Create-post modal ──
function CreateModal({ date, onClose, onCreated }: { date: string; onClose: () => void; onCreated: () => void }) {
  const base = new Date(date);
  const [body, setBody] = useState("");
  const [platform, setPlatform] = useState("linkedin");
  const [withImage, setWithImage] = useState(false);
  // Local HH:MM the post should go out; default 9:00 AM local.
  const [time, setTime] = useState("09:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const day = base.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const create = async () => {
    setBusy(true); setError("");
    try {
      // Combine the chosen day with the chosen local time → ISO.
      const [hh, mm] = time.split(":").map(Number);
      const when = new Date(base);
      when.setHours(hh || 0, mm || 0, 0, 0);
      const res = await fetch("/api/social/month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, platform, scheduledAt: when.toISOString(), withImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create the post.");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`New post · ${day}`}>
      <textarea className="w-full rounded-lg border border-app bg-surface-2 p-2 text-sm text-app" rows={5} placeholder="Write your post…" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-sm text-muted">Platform
          <select className="ml-2 rounded border border-app bg-surface-2 p-1 text-sm" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-sm text-muted">Time
          <input type="time" className="ml-2 rounded border border-app bg-surface-2 p-1 text-sm" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm text-muted">
          <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} /> Generate an image
        </label>
      </div>
      <p className="mt-2 text-xs text-faint">It&apos;ll be checked for compliance and land as a draft to review &amp; approve.</p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-app px-3 py-1.5 text-sm">Cancel</button>
        <button disabled={busy || !body.trim()} onClick={create} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? "Creating…" : "Create draft"}</button>
      </div>
    </Modal>
  );
}

// ── View-post modal ──
function PostModal({ post, onClose }: { post: Post; onClose: () => void }) {
  return (
    <Modal onClose={onClose} title={`${STATUS_LABEL[post.status] ?? post.status} · ${platformShort(post.platform)}`}>
      <div className="flex gap-3">
        <p className="flex-1 whitespace-pre-wrap text-sm text-app">{post.body || "(not drafted yet)"}</p>
        {post.mediaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.mediaUrl} alt="" className="h-24 w-24 shrink-0 rounded-lg object-cover" />
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded bg-app/60 px-1.5 py-0.5">{post.theme || "post"}</span>
        {post.classification && <span className="rounded bg-app/60 px-1.5 py-0.5">Reg FD: {post.classification}</span>}
        {post.manual && <span className="rounded bg-app/60 px-1.5 py-0.5">Manual</span>}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {post.postUrl && <a href={post.postUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-app px-3 py-1.5 text-sm text-sky-600">View live ↗</a>}
        <a href="/social/review" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Open in review</a>
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

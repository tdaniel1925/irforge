"use client";

import { useEffect, useRef, useState } from "react";

interface Profile { userId: string; displayName: string; officeStatus: "in" | "out"; statusReason: string }
interface Chat { id: string; authorName: string; body: string; createdAt: string; mine: boolean }

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Persistent right-hand "team home" rail: who's on/off (+ your status toggle) and
// team chat. Present across the whole app; collapses to a thin strip. Built to
// grow as more comms features land. Renders nothing for unauthed/empty responses.
export default function CommsSidebar() {
  const [open, setOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [me, setMe] = useState<"in" | "out" | null>(null);
  const [draft, setDraft] = useState("");
  const [outOpen, setOutOpen] = useState(false);
  const [outReason, setOutReason] = useState("");
  const [err, setErr] = useState("");
  const [unread, setUnread] = useState(0);     // new messages while collapsed
  const endRef = useRef<HTMLDivElement>(null);
  const lastSeenId = useRef<string | null>(null); // newest chat id the user has seen
  const lastCount = useRef(0);                  // to scroll only when new messages arrive

  const load = async () => {
    try {
      const res = await fetch("/api/comms", { cache: "no-store" });
      if (!res.ok) { setReady(false); return; }
      const d = await res.json();
      const nextChat: Chat[] = d.chat ?? [];
      setProfiles(d.profiles ?? []);
      setChat(nextChat);
      setReady(true);
      // Track unread: count messages newer than the last one the user saw, but never
      // count the user's own messages, and only while the panel is closed.
      const newestSeenIdx = lastSeenId.current ? nextChat.findIndex((c) => c.id === lastSeenId.current) : -1;
      const fresh = newestSeenIdx >= 0 ? nextChat.slice(newestSeenIdx + 1) : nextChat;
      const freshFromOthers = fresh.filter((c) => !c.mine).length;
      setUnread((prev) => (open ? 0 : prev + (freshFromOthers > 0 && lastSeenId.current ? freshFromOthers : 0)));
      if (open && nextChat.length) lastSeenId.current = nextChat[nextChat.length - 1].id;
      else if (!lastSeenId.current && nextChat.length) lastSeenId.current = nextChat[nextChat.length - 1].id;
    } catch { /* leave as-is */ }
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 8000); // light poll for liveness
    return () => clearInterval(t);
  }, []);
  // Scroll to bottom only when the message COUNT grows (not on every poll), so a user
  // scrolled up to read history isn't yanked back down every 8s.
  useEffect(() => {
    if (open && chat.length > lastCount.current) endRef.current?.scrollIntoView({ behavior: "smooth" });
    lastCount.current = chat.length;
  }, [chat, open]);
  // Opening the panel clears unread and marks everything seen.
  useEffect(() => {
    if (open) { setUnread(0); if (chat.length) lastSeenId.current = chat[chat.length - 1].id; }
  }, [open, chat]);

  // Only show the rail once we know the user has a company (authed company pages).
  if (!ready) return null;

  const inOffice = profiles.filter((p) => p.officeStatus === "in");
  const outOffice = profiles.filter((p) => p.officeStatus === "out");

  const setStatus = async (status: "in" | "out", reason = "") => {
    setMe(status);
    const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", officeStatus: status, statusReason: reason }) });
    const d = await res.json();
    if (res.ok && d.profiles) setProfiles(d.profiles);
  };
  const send = async () => {
    const body = draft.trim();
    if (!body) return;
    setErr("");
    setDraft("");
    try {
      const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "chat", body }) });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Couldn't send. Try again."); setDraft(body); return; }
      if (d.chat) setChat(d.chat);
    } catch {
      setErr("Couldn't reach the server. Try again.");
      setDraft(body); // restore the message so it isn't lost
    }
  };
  const del = async (id: string) => {
    setErr("");
    try {
      const res = await fetch("/api/comms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteChat", id }) });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "Couldn't delete."); return; }
      if (d.chat) setChat(d.chat);
    } catch { setErr("Couldn't delete. Try again."); }
  };

  // Collapsed strip.
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="sticky top-0 flex h-screen w-10 shrink-0 flex-col items-center gap-3 border-l border-app bg-surface py-4 text-muted hover:text-app" title={unread > 0 ? `${unread} new message${unread === 1 ? "" : "s"}` : "Open team panel"}>
        <span className="relative">
          💬
          {unread > 0 && (
            <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
        <span className="rotate-90 whitespace-nowrap text-xs tracking-wide">Team</span>
        <span className="mt-auto rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-600">{inOffice.length}</span>
      </button>
    );
  }

  return (
    <aside className="sticky top-0 flex h-screen w-72 shrink-0 flex-col border-l border-app bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-app px-3 py-2.5">
        <span className="text-sm font-semibold text-app">Team</span>
        <button onClick={() => setOpen(false)} className="text-muted hover:text-app" title="Collapse">→</button>
      </div>

      {/* Who's around + my status */}
      <div className="border-b border-app px-3 py-3">
        <div className="mb-2 flex gap-1.5">
          <button onClick={() => { setOutOpen(false); setStatus("in"); }} className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${me === "in" ? "bg-emerald-500 text-white" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"}`}>🟢 In</button>
          <button onClick={() => setOutOpen((o) => !o)} className={`flex-1 rounded-lg px-2 py-1 text-xs font-medium ${me === "out" ? "bg-amber-500 text-white" : "bg-amber-500/15 text-amber-700 dark:text-amber-300"}`}>🌴 Out</button>
        </div>
        {outOpen && (
          <div className="mb-2 space-y-1.5">
            <input autoFocus value={outReason} onChange={(e) => setOutReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { setStatus("out", outReason); setOutOpen(false); setOutReason(""); } }} placeholder="Reason (optional)" className="w-full rounded-lg border border-app bg-surface-2 px-2 py-1 text-xs text-app" />
            <div className="flex gap-1.5">
              <button onClick={() => { setStatus("out", outReason); setOutOpen(false); setOutReason(""); }} className="rounded bg-amber-500 px-2 py-1 text-xs text-white">Set</button>
              <button onClick={() => { setOutOpen(false); setOutReason(""); }} className="rounded border border-app px-2 py-1 text-xs">Cancel</button>
            </div>
          </div>
        )}
        <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">In office ({inOffice.length})</p>
        <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto">
          {inOffice.map((p) => <li key={p.userId} className="truncate text-xs text-app">🟢 {p.displayName}</li>)}
          {!inOffice.length && <li className="text-xs text-faint">—</li>}
        </ul>
        {outOffice.length > 0 && (
          <>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-600">Out ({outOffice.length})</p>
            <ul className="mt-1 max-h-20 space-y-0.5 overflow-y-auto">
              {outOffice.map((p) => <li key={p.userId} className="truncate text-xs text-muted">🌴 {p.displayName}{p.statusReason ? ` — ${p.statusReason}` : ""}</li>)}
            </ul>
          </>
        )}
      </div>

      {/* Chat */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        {chat.length === 0 && <p className="text-xs text-faint">No messages yet. Say hi 👋</p>}
        {chat.map((c) => (
          <div key={c.id} className={`group flex flex-col ${c.mine ? "items-end" : "items-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${c.mine ? "bg-emerald-600 text-white" : "bg-app/50 text-app"}`}>
              {!c.mine && <span className="mb-0.5 block text-[10px] font-medium opacity-70">{c.authorName}</span>}
              {c.body}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
              <span>{timeAgo(c.createdAt)}</span>
              {c.mine && <button onClick={() => del(c.id)} className="opacity-0 transition group-hover:opacity-100 hover:text-red-500">delete</button>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-app p-2">
        {err && <p className="mb-1.5 px-1 text-xs text-red-500">{err}</p>}
        <div className="flex gap-1.5">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} maxLength={1000} placeholder="Message the team…" className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <button disabled={!draft.trim()} onClick={send} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">→</button>
        </div>
      </div>
    </aside>
  );
}

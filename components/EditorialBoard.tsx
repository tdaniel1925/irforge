"use client";

import { useState } from "react";
import SmartTextarea from "@/components/SmartTextarea";

const DRAFT_SUGGESTIONS = [
  "A recent milestone or achievement",
  "A product or partnership update",
  "Educate investors on our sector",
  "An upcoming event or webinar",
];

interface Post {
  id: string; title: string; body: string; status: string;
  classification: string | null; classConfidence: number | null; classFlags: string[]; classReason: string;
  channels: string[]; scheduledAt: string | null; createdAt: string;
}
interface VoiceLite { id: string; name: string; roleTitle: string }

const CHANNELS = [
  { key: "twitter", label: "X" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
];

const COLUMNS = [
  { key: "draft", label: "Drafts" },
  { key: "reviewed", label: "In review" },
  { key: "approved", label: "Approved" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
];

const CLASS_STYLE: Record<string, string> = {
  green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  yellow: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  red: "bg-red-500/15 text-red-600 dark:text-red-300",
};

export default function EditorialBoard({ initialPosts, voices, canPublish = false }: { initialPosts: Post[]; voices: VoiceLite[]; canPublish?: boolean }) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [composing, setComposing] = useState(false);
  const [topic, setTopic] = useState("");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");

  const patchPost = (p: Post) => setPosts((ps) => ps.map((x) => (x.id === p.id ? p : x)));
  // Functional partial merge — always applies deltas to the CURRENT post, never a
  // click-time snapshot. The old `{ ...posts.find(id)!, ...delta }` pattern raced:
  // classify-while-dragging wrote back a stale object (card snapped back), and the
  // `!` threw if the post was removed mid-flight.
  const mergePost = (id: string, delta: Partial<Post>) =>
    setPosts((ps) => ps.map((x) => (x.id === id ? { ...x, ...delta } : x)));

  // ── Drag-and-drop between columns ──
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Which target columns a card may be dragged INTO from its current status.
  // Mirrors the server-side state machine; RED can't reach approved without counsel.
  const allowedTargets = (p: Post): string[] => {
    switch (p.status) {
      case "draft": return ["reviewed"];
      case "reviewed": return p.classification === "red" ? [] : ["approved", "draft"];
      case "approved": return ["scheduled"];
      default: return [];
    }
  };

  const dropOnColumn = async (colKey: string) => {
    const id = dragId;
    setDragId(null); setDragOverCol(null);
    if (!id) return;
    const p = posts.find((x) => x.id === id);
    if (!p || p.status === colKey || !allowedTargets(p).includes(colKey)) {
      if (p && !allowedTargets(p).includes(colKey) && p.status !== colKey) {
        setError(p.classification === "red" ? "RED posts need counsel sign-off before approval." : "That move isn't allowed.");
        setTimeout(() => setError(""), 2500);
      }
      return;
    }
    const prev = p.status;
    mergePost(id, { status: colKey }); // optimistic
    try {
      const res = await fetch("/api/iros/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "transition", to: colKey }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Move failed.");
      if (d.post) patchPost(d.post);
    } catch (e) {
      // Revert ONLY the status — restoring the full pre-drag snapshot wiped any
      // field a concurrent request (e.g. a classify) updated in the interim.
      mergePost(id, { status: prev });
      setError(e instanceof Error ? e.message : "Couldn't move that card.");
      setTimeout(() => setError(""), 2500);
    }
  };

  const aiDraft = async () => {
    if (!topic.trim()) return;
    setBusy("draft"); setError("");
    try {
      const res = await fetch("/api/iros/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic, voiceProfileId: voiceId || undefined }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setBody(d.text);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  const create = async () => {
    if (!body.trim()) return;
    setBusy("create"); setError("");
    try {
      const res = await fetch("/api/iros/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body, voiceProfileId: voiceId || undefined }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setPosts((ps) => [d.post, ...ps]);
      setComposing(false); setTopic(""); setBody(""); setTitle(""); setVoiceId("");
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  const classify = async (id: string) => {
    setBusy("c" + id); setError("");
    try {
      const res = await fetch("/api/iros/classify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Classification failed.");
      mergePost(id, { classification: d.classification, classConfidence: d.confidence, classFlags: d.flags, classReason: d.reasoning });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  const transition = async (id: string, to: string) => {
    setBusy("t" + id); setError("");
    try {
      const res = await fetch("/api/iros/posts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "transition", to }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      patchPost(d.post);
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  const publish = async (id: string, channels: string[]) => {
    setBusy("p" + id); setError("");
    try {
      const res = await fetch("/api/iros/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id, channels }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      mergePost(id, { status: "published", channels });
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  const approve = async (id: string) => {
    setBusy("a" + id); setError("");
    try {
      const res = await fetch("/api/iros/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId: id, stage: "approver", decision: "approved" }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      // reflect the new status (reviewed→approved or draft→reviewed) — computed from
      // the CURRENT status inside the functional update, not a click-time snapshot.
      setPosts((ps) => ps.map((x) => (x.id === id ? { ...x, status: x.status === "draft" ? "reviewed" : "approved" } : x)));
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); } finally { setBusy(""); }
  };

  return (
    <div>
      <button onClick={() => setComposing((v) => !v)} className="mb-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
        {composing ? "Close" : "+ New post"}
      </button>

      {composing && (
        <div className="mb-6 space-y-3 rounded-2xl border border-app bg-surface p-5">
          {/* AI draft helper */}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="What's it about? (AI will draft it)"
              className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
            {voices.length > 0 && (
              <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none">
                <option value="">Company voice</option>
                {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.roleTitle ? ` (${v.roleTitle})` : ""}</option>)}
              </select>
            )}
            <button onClick={aiDraft} disabled={busy === "draft" || !topic.trim()} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover disabled:opacity-50">
              {busy === "draft" ? "Drafting…" : "✨ AI draft"}
            </button>
          </div>
          {/* Quick topic starters — click to draft from a common idea */}
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[11px] text-faint">Try:</span>
            {DRAFT_SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setTopic(s)} disabled={busy === "draft"} className="rounded-full border border-app bg-surface px-2.5 py-0.5 text-[11px] text-muted transition hover:bg-app-hover hover:text-app disabled:opacity-50">{s}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)"
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <SmartTextarea value={body} onChange={setBody} rows={5} placeholder="Post text…" />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button onClick={create} disabled={busy === "create" || !body.trim()} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy === "create" ? "Saving…" : "Save as draft"}
          </button>
        </div>
      )}

      {error && !composing && <p className="mb-3 text-sm text-red-500">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = posts.filter((p) => p.status === col.key);
          const canDropHere = dragId ? allowedTargets(posts.find((x) => x.id === dragId) ?? ({} as Post)).includes(col.key) : false;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOverCol(col.key); } }}
              onDragLeave={() => setDragOverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => { e.preventDefault(); dropOnColumn(col.key); }}
              className={`rounded-xl border bg-surface-2/40 p-2 transition-colors duration-200 ${dragOverCol === col.key && canDropHere ? "border-emerald-500 bg-emerald-500/5" : dragOverCol === col.key ? "border-red-400/50" : "border-app"}`}
            >
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">{col.label} · {items.length}</p>
              <div className="space-y-2">
                {items.map((p) => (
                  <div
                    key={p.id}
                    draggable={allowedTargets(p).length > 0}
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    className={`rounded-lg border border-app bg-surface p-3 transition-all duration-200 ${allowedTargets(p).length > 0 ? "cursor-grab active:cursor-grabbing" : ""} ${dragId === p.id ? "scale-95 opacity-40" : ""}`}
                  >
                    {p.classification && (
                      <span className={`mb-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${CLASS_STYLE[p.classification]}`}>
                        {p.classification === "red" ? "🚨 " : ""}{p.classification}
                      </span>
                    )}
                    {p.title && <p className="text-sm font-semibold text-app">{p.title}</p>}
                    <p className="line-clamp-3 text-xs text-muted">{p.body}</p>

                    {/* 1-click actions by stage */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {!p.classification && p.status === "draft" && (
                        <button onClick={() => classify(p.id)} disabled={busy === "c" + p.id} className="rounded border border-app px-2 py-1 text-[11px] font-medium text-app hover:bg-app-hover disabled:opacity-50">
                          {busy === "c" + p.id ? "Checking…" : "🛡 Reg FD check"}
                        </button>
                      )}
                      {p.classification === "red" && ["draft", "reviewed"].includes(p.status) && (
                        <a href="/counsel" className="rounded bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-500/20 dark:text-red-300">Needs Counsel Console →</a>
                      )}
                      {p.classification && p.classification !== "red" && ["draft", "reviewed"].includes(p.status) && (
                        <button onClick={() => approve(p.id)} disabled={busy === "a" + p.id} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                          {busy === "a" + p.id ? "…" : p.status === "draft" ? "✓ Mark reviewed" : "✓ Approve"}
                        </button>
                      )}
                      {["approved", "scheduled"].includes(p.status) && canPublish && (
                        <PublishPicker busy={busy === "p" + p.id} onPublish={(ch) => publish(p.id, ch)} />
                      )}
                      {p.status === "approved" && !canPublish && (
                        <button onClick={() => transition(p.id, "scheduled")} disabled={busy === "t" + p.id} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                          {busy === "t" + p.id ? "…" : "📅 Schedule"}
                        </button>
                      )}
                      {p.status === "scheduled" && !canPublish && (
                        <a href="/billing" className="rounded border border-emerald-500/40 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400">
                          ⤴ Publishing needs an upgrade
                        </a>
                      )}
                      {["draft", "reviewed", "approved", "scheduled"].includes(p.status) && (
                        <button onClick={() => transition(p.id, "pulled")} disabled={busy === "t" + p.id} className="rounded border border-app px-2 py-1 text-[11px] text-muted hover:text-red-500">Pull</button>
                      )}
                    </div>
                  </div>
                ))}
                {items.length === 0 && <p className="px-1 py-3 text-center text-[11px] text-faint">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Tap "Publish", tick channels, send. Two clicks.
function PublishPicker({ busy, onPublish }: { busy: boolean; onPublish: (channels: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(["twitter"]);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500">📣 Publish</button>
    );
  }
  return (
    <div className="mt-1 w-full rounded-lg border border-app bg-surface-2 p-2">
      <div className="mb-2 flex flex-wrap gap-1">
        {CHANNELS.map((c) => {
          const on = sel.includes(c.key);
          return (
            <button key={c.key} onClick={() => setSel((s) => on ? s.filter((x) => x !== c.key) : [...s, c.key])}
              className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${on ? "bg-emerald-500 text-white" : "border border-app text-muted hover:text-app"}`}>
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        <button onClick={() => onPublish(sel)} disabled={busy || sel.length === 0} className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "Publishing…" : `Send to ${sel.length}`}
        </button>
        <button onClick={() => setOpen(false)} className="rounded border border-app px-2 py-1 text-[11px] text-muted hover:text-app">Cancel</button>
      </div>
    </div>
  );
}

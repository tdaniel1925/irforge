"use client";

import { useEffect, useState } from "react";

interface Note { id: string; title: string; body: string; pinned: boolean; updatedAt: string }

export default function WorkspacePage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Note> | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState("");

  const load = async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/workspace");
      if (!res.ok) { setLoadError(true); return; }
      const d = await res.json();
      setNotes(d.notes ?? []);
    } catch { setLoadError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setSaveError("");
    try {
      const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.note) {
        setNotes((ns) => { const ex = ns.some((n) => n.id === d.note.id); return ex ? ns.map((n) => n.id === d.note.id ? d.note : n) : [d.note, ...ns]; });
        setEditing(null);
      } else {
        setSaveError(d.error ?? "Couldn't save your note — try again.");
      }
    } catch { setSaveError("Network error — couldn't save your note."); }
    finally { setBusy(false); }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    const res = await fetch(`/api/workspace?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) setNotes((ns) => ns.filter((n) => n.id !== id));
    else alert("Couldn't delete that note — try again.");
  };

  const togglePin = async (n: Note) => {
    try {
      const res = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...n, pinned: !n.pinned }) });
      const d = await res.json();
      if (res.ok && d.note) await load();
    } catch { /* leave state as-is */ }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-app">My Workspace</h1>
      <p className="mt-1 text-sm text-muted">Your private notes and scratchpad. Only you can see these — not your teammates or admins.</p>

      {editing ? (
        <div className="mt-5 rounded-2xl border border-app bg-surface p-5">
          <input
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            placeholder="Title"
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm font-medium text-app focus:border-emerald-500 focus:outline-none"
          />
          <textarea
            value={editing.body ?? ""}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
            placeholder="Write anything — call notes, reminders, a draft…"
            rows={10}
            className="mt-3 w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
          {saveError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={save} disabled={busy} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
            <button onClick={() => setEditing(null)} className="rounded-lg border border-app px-4 py-2 text-sm font-medium text-app hover:bg-app-hover">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing({ title: "", body: "" })} className="mt-5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ New note</button>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : loadError ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">Couldn&apos;t load your notes. <button onClick={() => { setLoading(true); load(); }} className="font-medium underline">Retry</button></p>
        ) : notes.length === 0 && !editing ? (
          <p className="rounded-xl border border-dashed border-app p-8 text-center text-sm text-faint">No notes yet. Create your first one above.</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-app bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-app">{n.pinned && "📌 "}{n.title || "Untitled"}</h3>
                <div className="flex shrink-0 gap-1.5 text-xs">
                  <button onClick={() => togglePin(n)} className="rounded px-2 py-1 text-muted hover:bg-app-hover hover:text-app">{n.pinned ? "Unpin" : "Pin"}</button>
                  <button onClick={() => setEditing(n)} className="rounded px-2 py-1 text-muted hover:bg-app-hover hover:text-app">Edit</button>
                  <button onClick={() => del(n.id)} className="rounded px-2 py-1 text-red-600 hover:bg-red-500/10 dark:text-red-400">Delete</button>
                </div>
              </div>
              {n.body && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{n.body}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

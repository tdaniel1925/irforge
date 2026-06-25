"use client";

import { useState } from "react";
import MicDictate from "./MicDictate";
import InlineConfirm from "./InlineConfirm";

interface Voice {
  id: string;
  name: string;
  roleTitle: string;
  guidance: string;
  styleExamples: string[];
  forbiddenPhrases: string[];
  active: boolean;
}

const BLANK: Voice = { id: "", name: "", roleTitle: "", guidance: "", styleExamples: [], forbiddenPhrases: [], active: true };

export default function VoiceManager({ initial }: { initial: Voice[] }) {
  const [voices, setVoices] = useState<Voice[]>(initial);
  const [editing, setEditing] = useState<Voice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/iros/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editing,
          styleExamples: editing.styleExamples.filter(Boolean),
          forbiddenPhrases: editing.forbiddenPhrases.filter(Boolean),
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setVoices((vs) => {
        const exists = vs.some((v) => v.id === d.voice.id);
        return exists ? vs.map((v) => (v.id === d.voice.id ? d.voice : v)) : [...vs, d.voice];
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      const res = await fetch("/api/iros/voices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Couldn't delete that voice.");
        return;
      }
      setVoices((vs) => vs.filter((v) => v.id !== id));
    } catch {
      setError("Network error — couldn't delete that voice.");
    }
  };

  if (editing) {
    return (
      <div className="space-y-4 rounded-2xl border border-app bg-surface p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Jane Doe"
              className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </Field>
          <Field label="Role / title">
            <input value={editing.roleTitle} onChange={(e) => setEditing({ ...editing, roleTitle: e.target.value })} placeholder="CEO"
              className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          </Field>
        </div>
        <Field label="How they sound" hint="Plain description — tone, what they care about, how formal. Or tap Speak and just describe them out loud.">
          <textarea value={editing.guidance} onChange={(e) => setEditing({ ...editing, guidance: e.target.value })} rows={3}
            placeholder="Direct and humble. Leads with the customer. Avoids hype. Short sentences."
            className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <div className="mt-1.5"><MicDictate onText={(t) => setEditing((cur) => cur ? { ...cur, guidance: (cur.guidance + " " + t).trim() } : cur)} /></div>
        </Field>
        <Field label="Example posts (optional)" hint="Paste 1-3 real posts in their voice, one per line.">
          <textarea value={editing.styleExamples.join("\n")} onChange={(e) => setEditing({ ...editing, styleExamples: e.target.value.split("\n") })} rows={3}
            className="w-full resize-none rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        </Field>
        <Field label="Words to never use (optional)" hint="Comma-separated. e.g. revolutionary, game-changing, guarantee.">
          <input value={editing.forbiddenPhrases.join(", ")} onChange={(e) => setEditing({ ...editing, forbiddenPhrases: e.target.value.split(",").map((s) => s.trim()) })}
            className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !editing.name.trim()} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{busy ? "Saving…" : "Save voice"}</button>
          <button onClick={() => { setEditing(null); setError(""); }} className="rounded-lg border border-app px-5 py-2 text-sm text-app hover:bg-app-hover">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setEditing({ ...BLANK })} className="mb-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">+ Add a voice</button>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
      {voices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-app p-10 text-center text-sm text-muted">No voices yet. Add your CEO, CFO, or anyone who posts.</div>
      ) : (
        <div className="space-y-2">
          {voices.map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-xl border border-app bg-surface px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-app">{v.name} {v.roleTitle && <span className="font-normal text-faint">· {v.roleTitle}</span>}</p>
                {v.guidance && <p className="mt-0.5 line-clamp-1 text-xs text-muted">{v.guidance}</p>}
              </div>
              <div className="flex shrink-0 gap-3 text-xs">
                <button onClick={() => setEditing(v)} className="text-emerald-600 hover:underline dark:text-emerald-400">Edit</button>
                <InlineConfirm onConfirm={() => remove(v.id)} label="Delete" confirmLabel="Delete voice" className="text-muted hover:text-red-500" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-sm font-medium text-app">{label}</label>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

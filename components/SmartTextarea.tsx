"use client";

import { useState } from "react";

// A compose textarea with built-in writing help:
//   • native browser spellcheck (red squiggles) — free, instant
//   • "✨ Polish" button → AI fixes grammar / spacing / wording (you approve first)
//   • a quick "tidy spacing" that trims trailing spaces + collapses 3+ blank lines
// Inline-only (no popups). Drop-in replacement for a plain <textarea>.
export default function SmartTextarea({
  value,
  onChange,
  placeholder,
  rows = 5,
  maxLength,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const tidy = () => {
    const cleaned = value
      .split("\n")
      .map((l) => l.replace(/[ \t]+$/g, "")) // trailing whitespace
      .join("\n")
      .replace(/\n{3,}/g, "\n\n") // collapse 3+ blank lines
      .replace(/[ \t]{2,}/g, " "); // collapse runs of spaces
    onChange(cleaned);
  };

  const polish = async () => {
    if (!value.trim()) return;
    setBusy(true); setErr(""); setSuggestion(null);
    try {
      const r = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const d = await r.json();
      if (!r.ok) { setErr(d.error ?? "Couldn't polish."); return; }
      if (d.polished && d.polished.trim() !== value.trim()) setSuggestion(d.polished);
      else setErr("Looks clean already — no changes suggested.");
    } catch {
      setErr("Couldn't reach the editor service.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        spellCheck
        className={className || "w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"}
      />

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <button onClick={polish} disabled={busy || disabled || !value.trim()} className="rounded-lg border border-app px-2.5 py-1 text-xs font-medium text-app transition hover:bg-app-hover disabled:opacity-50">
          {busy ? "Polishing…" : "✨ Polish (grammar & spacing)"}
        </button>
        <button onClick={tidy} disabled={disabled || !value.trim()} className="rounded-lg border border-app px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-app-hover disabled:opacity-50" title="Trim extra spaces & blank lines">
          Tidy spacing
        </button>
        {err && <span className="text-xs text-amber-600 dark:text-amber-400">{err}</span>}
      </div>

      {suggestion && (
        <div className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Suggested edit</p>
          <p className="whitespace-pre-wrap text-sm text-app">{suggestion}</p>
          <div className="mt-2 flex gap-2">
            <button onClick={() => { onChange(suggestion); setSuggestion(null); }} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500">Apply</button>
            <button onClick={() => setSuggestion(null)} className="rounded-lg border border-app px-3 py-1 text-xs text-muted hover:bg-app-hover">Keep mine</button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface ChatMsg { role: "you" | "ai"; text: string }

// Writing Studio editor: a scrollable, fully-editable content window with a
// STICKY AI instruction bar pinned to the bottom of the viewport (ChatGPT/Claude
// style). Generate from a topic, edit the text by hand, or tell the AI to revise.
export default function StudioEditor({ companyTicker }: { companyTicker: string }) {
  const [content, setContent] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flags, setFlags] = useState<{ rule: string; excerpt: string; severity: string }[]>([]);
  const [log, setLog] = useState<ChatMsg[]>([]);

  const generate = async () => {
    if (!instruction.trim()) return;
    setBusy(true); setError("");
    try {
      // First message with empty content = generate from the topic.
      const res = await fetch("/api/studio/revise", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content || `Write a press release for $${companyTicker} about:`, instruction }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Couldn't generate.");
      setContent(d.text);
      setFlags(d.flags ?? []);
      setLog((l) => [...l, { role: "you", text: instruction }, { role: "ai", text: "Updated the document." }]);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  // Polish the document in place (grammar/spelling/spacing) — compliance-safe.
  const [polishing, setPolishing] = useState(false);
  const polish = async () => {
    if (!content.trim()) return;
    setPolishing(true); setError("");
    try {
      const res = await fetch("/api/ai/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: content }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Couldn't polish."); return; }
      if (d.polished && d.polished.trim() !== content.trim()) setContent(d.polished);
      else setError("Looks clean already — no changes suggested.");
    } catch {
      setError("Couldn't reach the editor service.");
    } finally {
      setPolishing(false);
    }
  };

  const blocking = flags.filter((f) => f.severity === "block");

  return (
    // Natural document flow (no fixed 100vh frame — that frame got pushed off-screen
    // inside the Compose page, hiding the Generate button). The AI bar is the FIRST
    // thing you see so the Generate/Revise button is always visible.
    <div>
      {/* Frame 1: AI instruction bar — always visible at the top */}
      <div className="rounded-xl border border-app bg-surface p-3">
        <label className="mb-1.5 block text-xs font-semibold text-app">
          {content ? "Tell the AI how to revise the press release" : "Describe the press release to generate"}
        </label>
        <div className="flex items-end gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
            rows={2}
            placeholder={content ? "e.g. 'make it shorter and add a forward-looking statement'… (⌘/Ctrl+Enter)" : "e.g. 'announce we acquired the Texatron unit'… (⌘/Ctrl+Enter)"}
            className="flex-1 resize-none rounded-xl border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
          <button disabled={busy || !instruction.trim()} onClick={generate} className="shrink-0 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
            {busy ? "Working…" : content ? "Revise" : "Generate"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <p className="mt-1.5 text-[11px] text-faint">
          {instruction.trim() ? "AI keeps it compliant — no price talk, predictions, or advice. Edit the text directly any time." : "Type a topic above, then press Generate to draft a compliant press release."}
        </p>
      </div>

      {/* Recent AI exchanges (compact) */}
      {log.length > 0 && (
        <div className="mt-3 max-h-20 overflow-y-auto rounded-lg bg-app/30 px-3 py-2 text-xs text-muted">
          {log.slice(-4).map((m, i) => <p key={i}><span className="font-semibold text-app">{m.role === "you" ? "You" : "AI"}:</span> {m.text}</p>)}
        </div>
      )}

      {/* Frame 2: editable document */}
      <div className="mt-3">
        {flags.length > 0 && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${blocking.length ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300" : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
            {blocking.length ? "⚠ Blocked language — fix before publishing: " : "Heads up: "}
            {flags.map((f) => f.rule).join(", ")}
          </div>
        )}
        {content.trim() && (
          <div className="mb-2 flex items-center gap-2">
            <button onClick={polish} disabled={polishing} className="rounded-lg border border-app px-2.5 py-1 text-xs font-medium text-app transition hover:bg-app-hover disabled:opacity-50">
              {polishing ? "Polishing…" : "✨ Polish (grammar & spacing)"}
            </button>
            <span className="text-[11px] text-faint">Fixes spelling/grammar/spacing without changing your meaning.</span>
          </div>
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck
          placeholder="Your document appears here. Type a topic in the bar above and hit Generate — or just start writing. You have full edit control."
          className="min-h-[50vh] w-full resize-y rounded-xl border border-app bg-surface p-4 text-sm leading-relaxed text-app focus:border-emerald-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

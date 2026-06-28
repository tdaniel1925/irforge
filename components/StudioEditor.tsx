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
    // Fills the content area; the AI bar sticks to the bottom of THIS frame.
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      {/* Frame 2: scrollable, editable content window */}
      <div className="min-h-0 flex-1 overflow-y-auto">
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
          placeholder="Your document appears here. Type a topic in the bar below and hit Generate — or just start writing. You have full edit control."
          className="h-full min-h-[50vh] w-full resize-none rounded-xl border border-app bg-surface p-4 text-sm leading-relaxed text-app focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Recent AI exchanges (compact) */}
      {log.length > 0 && (
        <div className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-app/30 px-3 py-2 text-xs text-muted">
          {log.slice(-4).map((m, i) => <p key={i}><span className="font-semibold text-app">{m.role === "you" ? "You" : "AI"}:</span> {m.text}</p>)}
        </div>
      )}

      {/* Frame 3: STICKY AI instruction bar (does not scroll with the content) */}
      <div className="sticky bottom-0 mt-3 border-t border-app bg-app/80 pt-3 backdrop-blur">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
            rows={2}
            placeholder={content ? "Tell the AI how to change it — e.g. 'make it shorter and add a forward-looking statement'… (⌘/Ctrl+Enter)" : "Describe the press release to generate — e.g. 'announce we acquired the Texatron unit for testing'… (⌘/Ctrl+Enter)"}
            className="flex-1 resize-none rounded-xl border border-app bg-surface p-3 text-sm text-app focus:border-emerald-500 focus:outline-none"
          />
          <button disabled={busy || !instruction.trim()} onClick={generate} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Working…" : content ? "Revise" : "Generate"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-faint">AI keeps it compliant — no price talk, predictions, or advice. Edit the text directly any time.</p>
      </div>
    </div>
  );
}

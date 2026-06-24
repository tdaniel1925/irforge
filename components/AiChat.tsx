"use client";

import { useEffect, useRef, useState } from "react";

interface Msg { role: "user" | "assistant"; content: string }

// Floating bottom-right AI assistant button + chat panel (the one Dru missed).
// Available on every app page via AppFrame.
export default function AiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Hi! I'm your IR assistant. Ask me anything about your filings, drafting a post, or how to use the app." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => m.role !== "assistant" || next.indexOf(m) > 0) }) });
      const d = await res.json();
      setMessages((m) => [...m, { role: "assistant", content: res.ok ? d.reply : (d.error || "Something went wrong.") }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "Couldn't reach the assistant — try again." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-2xl text-white shadow-lg transition hover:bg-emerald-500"
        aria-label="AI assistant"
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-40 flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col rounded-2xl border border-app bg-surface shadow-2xl">
          <div className="flex items-center gap-2 border-b border-app px-4 py-3">
            <span className="text-lg">✨</span>
            <span className="text-sm font-semibold text-app">IR Assistant</span>
            <span className="ml-auto text-[11px] text-faint">compliance-aware</span>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-emerald-600 text-white" : "bg-app/50 text-app"}`}>
                {m.content}
              </div>
            ))}
            {busy && <div className="rounded-2xl bg-app/50 px-3 py-2 text-sm text-muted">Thinking…</div>}
            <div ref={endRef} />
          </div>
          <div className="border-t border-app p-2">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Ask anything…"
                className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
              />
              <button disabled={busy || !input.trim()} onClick={send} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Send</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

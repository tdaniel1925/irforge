"use client";

import { useState } from "react";

export default function AskCompany({ ticker, claimed }: { ticker: string; claimed: boolean }) {
  const [author, setAuthor] = useState("");
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const submit = async () => {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, author, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setState("error");
      } else {
        setState("done");
        setQuestion("");
      }
    } catch {
      setError("Network error — try again.");
      setState("error");
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-app bg-app/95 backdrop-blur supports-[backdrop-filter]:bg-app/80">
      <div className="mx-auto max-w-4xl px-4 py-3">
        {state === "done" ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-emerald-300">
              ✓ Question posted.{" "}
              <span className="text-muted">
                {claimed ? "Answers are officer-approved and published here and on X at the same time." : "It's recorded publicly and waiting for the company to claim this page."}
              </span>
            </p>
            <button onClick={() => setState("idle")} className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400">
              Ask another
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {expanded && (
                <input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Name (optional)"
                  className="hidden w-40 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none sm:block"
                />
              )}
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onFocus={() => setExpanded(true)}
                onKeyDown={(e) => e.key === "Enter" && question.trim() && submit()}
                placeholder={`Ask ${claimed ? "the company" : `$${ticker}`} a question…`}
                className="flex-1 rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none"
              />
              <button
                onClick={submit}
                disabled={state === "busy" || !question.trim()}
                className="shrink-0 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:opacity-40"
              >
                {state === "busy" ? "Posting…" : "Ask"}
              </button>
            </div>
            {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
            {expanded && (
              <p className="mt-1.5 text-[11px] text-faint">
                Questions are public. Company answers are compliance-checked, officer-approved, and published here and on X at the same time — that simultaneity is what makes them fair, legal public disclosure.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

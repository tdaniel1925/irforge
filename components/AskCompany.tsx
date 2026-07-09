"use client";

import { useState } from "react";

export default function AskCompany({ ticker, claimed }: { ticker: string; claimed: boolean }) {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  // When posting requires sign-in or a username, show a prompt with the right link.
  const [gate, setGate] = useState<null | { kind: "auth" | "profile" }>(null);
  const [expanded, setExpanded] = useState(false);

  const submit = async () => {
    setState("busy");
    setError(""); setGate(null);
    try {
      // Author comes from the signed-in investor's profile (server-side) — the client
      // no longer supplies a name, so posts are never "Anonymous".
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, question }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsAuth) { setGate({ kind: "auth" }); setState("idle"); return; }
        if (data.needsProfile) { setGate({ kind: "profile" }); setState("idle"); return; }
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
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
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
            {gate && (
              <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-300">
                {gate.kind === "auth" ? (
                  <>Sign in as an investor to post — <a href="/login?type=investor" className="font-medium underline">create a free account</a> (takes a minute).</>
                ) : (
                  <>Pick a username first so your question isn&apos;t anonymous — <a href="/member/profile" className="font-medium underline">set your investor profile</a>.</>
                )}
              </p>
            )}
            {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
            {expanded && (
              <p className="mt-1.5 text-[11px] text-faint">
                Questions are public and posted under your investor username. Company answers are compliance-checked, officer-approved, and published here and on X at the same time — that simultaneity is what makes them fair, legal public disclosure.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

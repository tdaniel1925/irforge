"use client";

import { useState } from "react";

export default function AskCompany({ ticker, claimed }: { ticker: string; claimed: boolean }) {
  const [author, setAuthor] = useState("");
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

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
      }
    } catch {
      setError("Network error — try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
        Question posted.{" "}
        {claimed
          ? "It's now in the company's queue — answers are approved by a named officer and published here and on X simultaneously, so everyone sees them at once."
          : "This page is unclaimed — your question is recorded publicly and will be waiting when the company claims its page."}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4">
      <p className="mb-2 text-sm font-medium text-white">Ask {claimed ? "the company" : `$${ticker}`} a question</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name or handle (optional)"
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none sm:w-56"
        />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="e.g. What's the cash runway after the latest quarter?"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
        />
        <button
          onClick={submit}
          disabled={state === "busy"}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {state === "busy" ? "Posting…" : "Ask"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <p className="mt-2 text-[11px] text-slate-600">
        Questions are public. Company answers are compliance-checked, officer-approved, and published here and on X at the same time — that simultaneity is what makes them fair, legal public disclosure.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";

export default function ClaimCard({ ticker }: { ticker: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name, email, role }),
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
      <div className="mt-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
        <p className="text-lg font-semibold text-emerald-300">Request received.</p>
        <p className="mt-1 text-sm text-slate-300">
          We&apos;ll verify you&apos;re with the company and reach out within one business day to activate your page.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0 max-w-md">
          <p className="text-xs font-bold tracking-wider text-amber-400">UNCLAIMED PAGE</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Is this your company? Everything on this page is happening without you.</h2>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-300">
            <li>✓ Verified company badge — investors know it&apos;s really you</li>
            <li>✓ Answer the questions on this page, compliance-checked, from your public record</li>
            <li>✓ Publish updates the moment you file — with disclosures handled automatically</li>
            <li>✓ Raise the grade at the top of this page, and watch it move monthly</li>
          </ul>
        </div>
        <div className="w-full max-w-xs space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Work email"
            type="email"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (CEO, CFO, IR…)"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 focus:border-amber-500 focus:outline-none"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            onClick={submit}
            disabled={state === "busy"}
            className="w-full rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-50"
          >
            {state === "busy" ? "Sending…" : `Claim $${ticker} →`}
          </button>
          <p className="text-center text-[11px] text-slate-600">Free to claim. Verification required.</p>
        </div>
      </div>
    </div>
  );
}

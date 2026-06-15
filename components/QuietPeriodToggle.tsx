"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One-click quiet-period switch. When ON, the system blocks approval of any
// yellow/red post until it's turned off. Simple by design — no forms.
export default function QuietPeriodToggle({ initialActive }: { initialActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(initialActive);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = async () => {
    setBusy(true);
    setError("");
    const next = !active;
    try {
      const res = await fetch("/api/iros/quiet-period", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: next ? "start" : "end", description: "Quiet period (manual)" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed.");
      setActive(next);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${active ? "border-amber-500/50 bg-amber-500/10" : "border-app bg-surface"}`}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-app">
            {active ? "🔇 Quiet period is ON" : "Quiet period"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {active
              ? "Sensitive (yellow/red) posts are blocked from approval until you turn this off."
              : "Turn on before earnings or around material events to block sensitive posts automatically."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${active ? "border border-app text-app hover:bg-app-hover" : "bg-amber-600 text-white hover:bg-amber-500"}`}
        >
          {busy ? "…" : active ? "End quiet period" : "Start quiet period"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

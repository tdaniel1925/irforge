"use client";

import { useState } from "react";

export default function MemberBillingActions({
  plan,
  isCurrent,
  isPaid,
  hasCustomer,
}: {
  plan: string;
  isCurrent: boolean;
  isPaid: boolean;
  hasCustomer: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const go = async (path: string, body?: object) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (data.url) window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  };

  // Free plan card
  if (!isPaid) {
    return isCurrent ? (
      <span className="block rounded-lg border border-app px-4 py-2 text-center text-sm text-muted">Your current plan</span>
    ) : (
      <button onClick={() => go("/api/member-billing/portal")} disabled={busy} className="w-full rounded-lg border border-app px-4 py-2 text-sm font-medium text-app transition hover:bg-app-hover disabled:opacity-50">
        {busy ? "…" : "Downgrade in portal"}
      </button>
    );
  }

  // Paid plan card
  if (isCurrent || hasCustomer) {
    return (
      <>
        <button onClick={() => go("/api/member-billing/portal")} disabled={busy} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
          {busy ? "…" : "Manage subscription"}
        </button>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </>
    );
  }

  return (
    <>
      <button onClick={() => go("/api/member-billing/checkout", { plan })} disabled={busy} className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
        {busy ? "…" : "Upgrade to Investor+"}
      </button>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </>
  );
}

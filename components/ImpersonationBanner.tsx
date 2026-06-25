"use client";

import { useEffect, useState } from "react";

// Shown app-wide when a super-admin is impersonating a company, so it's always
// obvious and one click to exit. Silent (renders nothing) when not impersonating
// or for non-admins (the API returns 403/null).
export default function ImpersonationBanner() {
  const [co, setCo] = useState<{ id: string; name: string; ticker: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/impersonate")
      .then((r) => (r.ok ? r.json() : { impersonating: null }))
      .then((d) => setCo(d.impersonating ?? null))
      .catch(() => {});
  }, []);

  if (!co) return null;

  const stop = async () => {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    window.location.href = "/admin";
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-black">
      <span>👁 Acting as <strong>{co.name || "Company"}{co.ticker ? ` ($${co.ticker})` : ""}</strong> — changes affect their account.</span>
      <button onClick={stop} className="rounded bg-black/80 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-black">Exit</button>
    </div>
  );
}

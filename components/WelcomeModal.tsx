"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// One-time welcome shown to a new user on their first dashboard visit. Points them
// to the setup checklist + the "how setup works" guide, then records a per-user
// 'welcomed' flag so it never shows again.
export default function WelcomeModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user-flags")
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d && d.welcomed === false) setOpen(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dismiss = () => {
    setOpen(false);
    fetch("/api/user-flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flag: "welcomed" }) }).catch(() => {});
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Welcome to PubcoZone">
      <div className="w-full max-w-md rounded-2xl border border-app bg-surface p-7 shadow-2xl">
        <p className="text-3xl">👋</p>
        <h2 className="mt-2 text-xl font-bold text-app">Welcome to PubcoZone</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Let&apos;s get your company live — it takes about 10 minutes. Your setup checklist tracks what&apos;s done and
          what&apos;s left, and nothing ever posts without your approval.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/setup" onClick={dismiss} className="rounded-lg bg-emerald-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-emerald-500">
            Start setup →
          </Link>
          <Link href="/help/setup" onClick={dismiss} className="rounded-lg border border-app px-4 py-2.5 text-center text-sm font-medium text-app transition hover:bg-app-hover">
            How setup works
          </Link>
          <button onClick={dismiss} className="mt-1 text-center text-xs text-faint hover:text-muted">
            I&apos;ll look around first
          </button>
        </div>
      </div>
    </div>
  );
}

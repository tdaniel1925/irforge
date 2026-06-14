"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Shown in the dashboard when the logged-in company is on the FREE tier — free is a
// public page only, so the tools are locked until they upgrade.
export default function FreeTierBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    fetch("/api/state", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authed && d.company?.tier === "free") setShow(true);
      })
      .catch(() => {});
  }, []);

  if (!show) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-5 py-3">
      <p className="text-sm text-amber-700 dark:text-amber-200">
        <span className="font-semibold">You&apos;re on the Free plan</span> — that&apos;s your verified public page. The IR tools (posting to X,
        drafting, Threat Radar, CRM, and more) unlock on a paid plan.
      </p>
      <Link href="/billing" className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400">
        Upgrade to unlock →
      </Link>
    </div>
  );
}

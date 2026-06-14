"use client";

import Link from "next/link";
import { useState } from "react";

export default function WatchlistItem({ ticker, since }: { ticker: string; since: string }) {
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/watch", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker }),
      });
      if (res.ok) setRemoved(true);
    } finally {
      setBusy(false);
    }
  };

  if (removed) return null;

  const date = since ? new Date(since).toLocaleDateString() : "";
  return (
    <div className="flex items-center justify-between rounded-xl border border-app bg-surface px-4 py-3">
      <Link href={`/t/${ticker}`} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">${ticker}</Link>
      <div className="flex items-center gap-4">
        {date && <span className="text-xs text-faint">watching since {date}</span>}
        <button onClick={remove} disabled={busy} className="text-xs text-muted transition hover:text-red-500 disabled:opacity-50">
          {busy ? "…" : "Remove"}
        </button>
      </div>
    </div>
  );
}

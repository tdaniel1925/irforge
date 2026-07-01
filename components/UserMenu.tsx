"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Top-right profile dropdown for the company dashboard: account email + quick
// links (Settings, Billing, Workspace, Team) and Log out. Closes on outside
// click / Escape.
export default function UserMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, []);

  const signOut = async () => {
    try { await createClient().auth.signOut(); } catch { /* ignore */ }
    router.push("/");
  };

  const initial = (email || "?").charAt(0).toUpperCase();
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-muted transition hover:bg-app-hover hover:text-app";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-app bg-surface py-1 pl-1 pr-3 text-sm text-app transition hover:bg-app-hover"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">{initial}</span>
        <span className="hidden max-w-[160px] truncate sm:inline">{email || "Account"}</span>
        <span className="text-faint">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-app bg-surface shadow-xl" role="menu">
          <div className="border-b border-app px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Signed in as</p>
            <p className="truncate text-sm font-medium text-app">{email || "—"}</p>
          </div>
          {/* Account */}
          <div className="p-1.5">
            <Link href="/settings" onClick={() => setOpen(false)} className={item}>⚙ Settings</Link>
            <Link href="/billing" onClick={() => setOpen(false)} className={item}>💳 Billing &amp; plan</Link>
            <Link href="/team" onClick={() => setOpen(false)} className={item}>👤 Team</Link>
            <Link href="/workspace" onClick={() => setOpen(false)} className={item}>🗒 My workspace</Link>
          </div>
          {/* Set up & configure (moved out of the daily sidebar) */}
          <div className="border-t border-app p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Set up</p>
            <Link href="/setup" onClick={() => setOpen(false)} className={item}>🚀 Get started</Link>
            <Link href="/social/setup" onClick={() => setOpen(false)} className={item}>🎨 Brand &amp; social</Link>
            <Link href="/embeds" onClick={() => setOpen(false)} className={item}>🔗 Website widgets</Link>
          </div>
          {/* Grow & share */}
          <div className="border-t border-app p-1.5">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-faint">Grow &amp; share</p>
            <Link href="/marketing-kit" onClick={() => setOpen(false)} className={item}>📣 Marketing kit</Link>
            <Link href="/briefs" onClick={() => setOpen(false)} className={item}>📄 Research brief</Link>
            <Link href="/ticker-audit" onClick={() => setOpen(false)} className={item}>🔎 Look up a ticker</Link>
          </div>
          {/* Help */}
          <div className="border-t border-app p-1.5">
            <Link href="/help" onClick={() => setOpen(false)} className={item}>❓ Help center</Link>
            <Link href="/learn" onClick={() => setOpen(false)} className={item}>📚 Public company 101</Link>
          </div>
          <div className="border-t border-app p-1.5">
            <button onClick={signOut} className={`${item} text-red-600 hover:text-red-600 dark:text-red-400`}>↩ Log out</button>
          </div>
        </div>
      )}
    </div>
  );
}

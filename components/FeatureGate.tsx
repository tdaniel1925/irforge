"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState } from "./ui";
import { TIERS, FEATURE_MIN_TIER, type Feature, type Tier } from "@/lib/billing";
import { fetchAppState } from "@/lib/appStateClient";

// Client-side hard gate for a tool page. Reads the CANONICAL capability map from
// /api/state (lib/authz) — the SAME answer server capability guards use — instead
// of recomputing access from tier. This is what makes the client agree with the
// server: a comped company, a super-admin, or a company with an IROS flag granted
// beyond its tier all unlock correctly. When Supabase auth is off (local demo),
// everything is unlocked.
export default function FeatureGate({ feature, children }: { feature: Feature; children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "locked" | "anon">("loading");
  const [tier, setTier] = useState<Tier>("free");

  useEffect(() => {
    // Shared fetcher — dedupes with Sidebar/FreeTierBanner/useAppState so a page
    // load costs one /api/state request instead of 3-4.
    fetchAppState()
      .then((r) => {
        const d = r.data as { authed?: boolean; company?: { tier?: string }; capabilities?: Record<string, boolean>; fullAccess?: boolean };
        // Local/demo mode (not authed against Supabase) — no gating.
        if (r.ok && !d.authed) { setState("ok"); return; }
        if (!r.ok) { setState("locked"); return; } // fail CLOSED on errors
        setTier((d.company?.tier ?? "free") as Tier);
        // Canonical: consume the server-computed capability map. fullAccess opens
        // everything; otherwise the per-capability boolean is authoritative.
        const allowed = d.fullAccess === true || d.capabilities?.[feature] === true;
        setState(allowed ? "ok" : "locked");
      })
      // Fail CLOSED: if we can't confirm access, lock rather than unlock.
      .catch(() => setState("locked"));
  }, [feature]);

  if (state === "loading") return <LoadingState />;
  if (state === "ok") return <>{children}</>;

  const need = FEATURE_MIN_TIER[feature];
  const needName = TIERS[need].name;

  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/40 bg-amber-500/10 text-2xl">🔒</div>
      <h1 className="text-2xl font-bold text-app">This tool is on the {needName} plan</h1>
      <p className="mx-auto mt-3 max-w-md text-muted">
        {tier === "free"
          ? "You're on the Free plan — a verified public page. Upgrade to unlock the IR tools, post responses to X, and run your investor relations from here."
          : `Your current plan doesn't include this. It's available on ${needName} and above.`}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/billing" className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">See plans →</Link>
        <Link href="/" className="rounded-lg border border-app px-5 py-2.5 text-sm text-app hover:bg-app-hover">Back to your page</Link>
      </div>
    </div>
  );
}

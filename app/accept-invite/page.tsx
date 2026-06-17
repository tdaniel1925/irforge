"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function AcceptInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"checking" | "needs-auth" | "ready" | "accepting" | "done" | "error">("checking");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      if (!token) { setState("error"); setMsg("This invite link is missing its token."); return; }
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setState("needs-auth"); return; }
      setState("ready");
    })();
  }, [token]);

  const accept = async () => {
    setState("accepting"); setMsg("");
    try {
      const res = await fetch("/api/team/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Couldn't accept the invite.");
      setState("done");
    } catch (e) {
      setState("error"); setMsg(e instanceof Error ? e.message : "Failed.");
    }
  };

  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <p className="mb-6 text-3xl font-bold tracking-tight"><span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone.</span></p>
      <div className="rounded-2xl border border-app bg-surface p-8">
        <h1 className="text-xl font-bold text-app">Team invitation</h1>

        {state === "checking" && <p className="mt-3 text-sm text-muted">Checking your invite…</p>}

        {state === "needs-auth" && (
          <>
            <p className="mt-3 text-sm text-muted">Sign in (or create an account) with the email this invite was sent to, then return to this link to join the team.</p>
            <Link href={`/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`} className="mt-5 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Sign in to accept →
            </Link>
          </>
        )}

        {state === "ready" && (
          <>
            <p className="mt-3 text-sm text-muted">You&apos;re signed in. Accept to join the company&apos;s dashboard.</p>
            <button onClick={accept} className="mt-5 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Accept invitation
            </button>
          </>
        )}

        {state === "accepting" && <p className="mt-3 text-sm text-muted">Joining…</p>}

        {state === "done" && (
          <>
            <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">🎉 You&apos;re in! You now have access to the company dashboard.</p>
            <Link href="/app" className="mt-5 inline-block rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500">
              Open the dashboard →
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{msg}</p>
            <Link href="/login" className="mt-5 inline-block rounded-lg border border-app px-5 py-2.5 text-sm font-semibold text-app transition hover:bg-app-hover">
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
      <AcceptInner />
    </Suspense>
  );
}

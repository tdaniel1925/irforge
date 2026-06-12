"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const configured = supabaseConfigured();

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg({ text: error.message, ok: false });
        else window.location.href = "/onboarding";
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg({ text: error.message, ok: false });
        else window.location.href = "/app";
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Something went wrong.", ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex items-baseline justify-center gap-0.5 text-3xl font-bold">
          <span className="text-app">Pubco</span><span className="text-emerald-600 dark:text-emerald-400">Zone</span><span className="text-emerald-600 dark:text-emerald-400">.</span>
        </Link>

        {!configured ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-700 dark:text-amber-300">
            Sign-in isn&apos;t configured yet — add your Supabase keys and run the schema. The app still runs locally in single-company mode.
          </div>
        ) : (
          <div className="rounded-2xl border border-app bg-surface p-7">
            <h1 className="text-lg font-semibold text-app">{mode === "signin" ? "Sign in" : "Create your account"}</h1>
            <p className="mt-1 text-sm text-muted">{mode === "signin" ? "Welcome back." : "Set up your company's IR command center."}</p>

            <div className="mt-5 space-y-3">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Work email"
                className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} type="password" placeholder="Password"
                className="w-full rounded-lg border border-app bg-surface-2 px-3 py-2.5 text-sm text-app focus:border-emerald-500 focus:outline-none" />
              {msg && <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-500"}`}>{msg.text}</p>}
              <button onClick={submit} disabled={busy || !email || !password}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50">
                {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
              </button>
            </div>

            <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }} className="mt-4 w-full text-center text-xs text-muted hover:text-app">
              {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

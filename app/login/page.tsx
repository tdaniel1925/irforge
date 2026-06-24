"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Honor ?mode=signup (from the split-hero CTAs); ?mode=reset lands on sign-in.
  const [mode, setMode] = useState<"signin" | "signup">(() => {
    if (typeof window === "undefined") return "signin";
    return new URLSearchParams(window.location.search).get("mode") === "signup" ? "signup" : "signin";
  });
  // Honor ?type=investor|company so the split-hero CTAs preselect the right side.
  const [accountType, setAccountType] = useState<"investor" | "company">(() => {
    if (typeof window === "undefined") return "investor";
    return new URLSearchParams(window.location.search).get("type") === "company" ? "company" : "investor";
  });
  const [busy, setBusy] = useState(false);
  // Surface an ?error= passed back from the /auth/callback route (expired/invalid link).
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(() => {
    if (typeof window === "undefined") return null;
    const err = new URLSearchParams(window.location.search).get("error");
    return err ? { text: err, ok: false } : null;
  });

  const configured = supabaseConfigured();

  // Optional post-login destination (e.g. accepting a team invite). Only allow
  // same-site relative paths.
  const nextParam = (() => {
    if (typeof window === "undefined") return null;
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") ? n : null;
  })();

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        // If email confirmation is ON, send the user back through /auth/callback
        // and carry the post-signup destination (e.g. onboarding?ticker=AMFN) in
        // ?next= so a claim survives the email-link round trip.
        const emailRedirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/callback${nextParam ? `?next=${encodeURIComponent(nextParam)}` : ""}`
            : undefined;
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // account_type drives the signup trigger (only 'company' mints a company
          // row) and post-signup routing. Absence defaults to 'company' server-side.
          options: { data: { account_type: accountType === "investor" ? "member" : "company" }, emailRedirectTo },
        });
        if (error) { setMsg({ text: error.message, ok: false }); return; }
        // With email confirmation OFF (current setting), signUp returns a session and
        // we redirect straight in. Safety net: if confirmation is ever turned back ON,
        // signUp returns no session — show "check your email" instead of bouncing.
        if (!data.session) {
          setMsg({ text: "Check your email to confirm your account, then sign in.", ok: true });
          setMode("signin");
          return;
        }
        window.location.href = nextParam ?? (accountType === "investor" ? "/member" : "/onboarding");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setMsg({ text: error.message, ok: false }); return; }
        // Route by the account type stamped at signup (or honor an explicit next=).
        const type = data.user?.user_metadata?.account_type;
        window.location.href = nextParam ?? (type === "member" ? "/member" : "/app");
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
            <p className="mt-1 text-sm text-muted">
              {mode === "signin"
                ? "Welcome back."
                : accountType === "investor"
                ? "Track companies, join the conversation, get alerts."
                : "Set up your company's IR command center."}
            </p>

            {mode === "signup" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccountType("investor")}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${accountType === "investor" ? "border-emerald-500 bg-emerald-500/10" : "border-app hover:bg-app-hover"}`}
                >
                  <span className="block font-semibold text-app">👤 I&apos;m an investor</span>
                  <span className="block text-[11px] text-faint">Follow, post, get alerts</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType("company")}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm transition ${accountType === "company" ? "border-emerald-500 bg-emerald-500/10" : "border-app hover:bg-app-hover"}`}
                >
                  <span className="block font-semibold text-app">🏢 I&apos;m a company</span>
                  <span className="block text-[11px] text-faint">Claim & run your IR</span>
                </button>
              </div>
            )}

            <div className="mt-5 space-y-3">
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={accountType === "investor" && mode === "signup" ? "Email" : "Work email"}
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

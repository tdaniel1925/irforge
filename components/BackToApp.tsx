"use client";

import { useEffect, useState } from "react";
import { createClient, supabaseConfigured } from "@/lib/supabase/client";

// On a public page (e.g. a company viewing its own /t/TICKER), show a "Back to
// dashboard" link — but only if the viewer is actually signed in. Routes company
// accounts to /app and investor (member) accounts to /member.
export default function BackToApp() {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let active = true;
    createClient().auth.getUser()
      .then(({ data }) => {
        if (!active || !data.user) return;
        const type = data.user.user_metadata?.account_type;
        setHref(type === "member" ? "/member" : "/app");
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!href) return null;
  return (
    <a href={href} className="rounded-lg border border-app px-3 py-1.5 text-sm font-medium text-app transition hover:bg-app-hover">
      ← Back to dashboard
    </a>
  );
}

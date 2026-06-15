"use client";

import { useCallback, useEffect, useState } from "react";
import type { Database } from "@/lib/types";

export type AppState = Database & { hasAi?: boolean; hasAyrshare?: boolean; hasSupabase?: boolean; stripeMode?: string; authed?: boolean };

export function useAppState() {
  const [db, setDb] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      // Not signed in (auth enforced) → send them to login instead of showing
      // a confusing error inside the dashboard shell.
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`Couldn't load your data (${res.status}). Try refreshing.`);
      setDb(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Generic mutation helper: fires the request, refreshes state, surfaces API errors.
  const act = useCallback(
    async (url: string, method: string, body?: unknown): Promise<string | null> => {
      setBusy(true);
      try {
        const res = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        await refresh();
        if (!res.ok) return (data as { error?: string }).error ?? `Request failed (${res.status})`;
        return null;
      } catch {
        return "Network error";
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  return { db, error, busy, refresh, act };
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { Database } from "@/lib/types";

export type AppState = Database & { hasAi?: boolean; hasAyrshare?: boolean };

export function useAppState() {
  const [db, setDb] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`API ${res.status}`);
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

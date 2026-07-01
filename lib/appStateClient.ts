// Client-side shared fetcher for /api/state — the app's heaviest endpoint.
// Sidebar, FeatureGate, FreeTierBanner, and useAppState each mount per page and used
// to fire their OWN fetch, so every page load hit /api/state 3-4 times. This module
// dedupes concurrent calls (they share one in-flight request) and caches the result
// briefly, so a page load costs ONE request.
//
// Semantics preserved per consumer: the fetcher returns { status, ok, data } and never
// throws on HTTP errors — each caller keeps its own 401/error handling. Mutations must
// pass { fresh: true } (useAppState.refresh does) to bypass and repopulate the cache.
//
// Cache is per-browser-tab (module scope), same signed-in user — safe for the
// per-user superAdmin flag. TTL is short: freshness across navigations wins.

export interface AppStateResponse {
  status: number;
  ok: boolean;
  data: Record<string, unknown>;
}

const TTL_MS = 10_000;

let cached: { at: number; value: AppStateResponse } | null = null;
let inflight: Promise<AppStateResponse> | null = null;

export function invalidateAppState(): void {
  cached = null;
}

export async function fetchAppState(opts?: { fresh?: boolean }): Promise<AppStateResponse> {
  const fresh = Boolean(opts?.fresh);
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!fresh && inflight) return inflight;

  const p = (async (): Promise<AppStateResponse> => {
    const res = await fetch("/api/state", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const value: AppStateResponse = { status: res.status, ok: res.ok, data };
    // Only cache successes — errors should retry on the next caller.
    if (res.ok) cached = { at: Date.now(), value };
    else cached = null;
    return value;
  })();

  inflight = p;
  try {
    return await p;
  } finally {
    inflight = null;
  }
}

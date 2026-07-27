// Decides whether the auth middleware enforces login. Lives outside middleware.ts
// so the decision table is unit-testable (same pattern as lib/publicRoutes.ts).
//
// FAIL-CLOSED DESIGN: any Vercel deployment (production, preview, or dev) enforces
// auth unless AUTH_ENABLED is EXPLICITLY "0". The old rule ("open unless
// AUTH_ENABLED=1") meant a deleted/missing var silently published the whole app —
// and Vercel preview deploys that don't inherit prod env vars would run wide open.
//
//   enforce       — require a session for non-public routes
//   open          — no gating (local dev / explicit opt-out off-Vercel)
//   unconfigured  — deployed but Supabase env is missing: BLOCK protected routes
//                   with 503 rather than falling open (can't verify anyone).
export type AuthGateDecision = "enforce" | "open" | "unconfigured";

export interface AuthGateEnv {
  supabaseUrl?: string;      // NEXT_PUBLIC_SUPABASE_URL
  authEnabled?: string;      // AUTH_ENABLED ("1" | "0" | "" | undefined)
  vercelEnv?: string;        // VERCEL_ENV ("production" | "preview" | "development" | undefined)
  vercel?: string;           // VERCEL ("1" on any Vercel deployment)
}

export function decideAuthGate(env: AuthGateEnv): AuthGateDecision {
  const onVercel = env.vercel === "1" || !!env.vercelEnv;
  const explicitlyOff = env.authEnabled === "0";
  const explicitlyOn = env.authEnabled === "1";

  // Explicit opt-in always enforces (this is today's production config).
  if (explicitlyOn) return env.supabaseUrl ? "enforce" : "unconfigured";

  if (onVercel) {
    // Deployed: default is ENFORCE. AUTH_ENABLED=0 is an explicit, visible
    // escape hatch — but never for the production environment itself.
    if (explicitlyOff && env.vercelEnv !== "production") return "open";
    return env.supabaseUrl ? "enforce" : "unconfigured";
  }

  // Off-Vercel (local dev, CI): preserve the historic default — open unless
  // explicitly enabled. `next dev` demo mode depends on this.
  return "open";
}

export function readAuthGateEnv(): AuthGateEnv {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    authEnabled: process.env.AUTH_ENABLED,
    vercelEnv: process.env.VERCEL_ENV,
    vercel: process.env.VERCEL,
  };
}

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Safe deploy diagnostic: reports ONLY booleans about whether auth-critical env vars
// are PRESENT and correctly valued — never their actual values. Used to confirm on a
// live deployment that authentication is actually enforced (AUTH_ENABLED=1 + Supabase
// configured). Exposes no secrets, so it's safe to leave public.
//
// authEnforced === true means middleware.ts gates protected routes. If it's false on
// production, the app is running in open single-company mode (NOT protected).
export async function GET() {
  const authEnabledRaw = process.env.AUTH_ENABLED;
  const supabaseUrlSet = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonSet = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleSet = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Middleware only enforces auth when BOTH are true (see middleware.ts).
  const authEnforced = authEnabledRaw === "1" && supabaseUrlSet;

  return NextResponse.json({
    // The single answer you care about:
    authEnforced,
    // The pieces that make it up (booleans only — no values):
    checks: {
      AUTH_ENABLED_is_exactly_1: authEnabledRaw === "1",
      AUTH_ENABLED_present: authEnabledRaw !== undefined && authEnabledRaw !== "",
      NEXT_PUBLIC_SUPABASE_URL_present: supabaseUrlSet,
      NEXT_PUBLIC_SUPABASE_ANON_KEY_present: supabaseAnonSet,
      SUPABASE_SERVICE_ROLE_KEY_present: serviceRoleSet,
    },
    note: authEnforced
      ? "Auth is ENFORCED on this deployment."
      : "Auth is NOT enforced — protected routes are OPEN. Set AUTH_ENABLED=1 (and Supabase env) on this environment.",
  });
}

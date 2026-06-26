import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFullDb } from "@/lib/supabase/store";
import { stripeMode } from "@/lib/billing";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

// This response carries a PER-USER superAdmin flag — it must never be cached by a
// CDN/proxy/browser and re-served to a different user.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, private" };

export async function GET() {
  const superAdmin = await isSuperAdmin();
  const flags = {
    hasAi: Boolean(process.env.ANTHROPIC_API_KEY),
    hasAyrshare: Boolean(process.env.ZERNIO_API_KEY),
    hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stripeMode: stripeMode(),
    superAdmin,
  };

  // Multi-tenant: serve the logged-in user's company from Supabase.
  const mine = await getFullDb();
  if (mine) {
    // Full-access companies report the top tier so the tier-gating (FeatureGate)
    // opens every dashboard tool:
    //  - super admins (platform owners), and
    //  - COMPED/promo companies (given free full access, no Stripe subscription).
    // Without this, a comped company shows as tier "free" and hits the upgrade
    // wall on every tool even though it was granted everything.
    const co = mine.company as Record<string, unknown>;
    const fullAccess = superAdmin || co.comped === true;
    const company = fullAccess ? { ...co, tier: "pro" } : co;
    return NextResponse.json({ ...mine, company, ...flags, authed: true }, { headers: NO_STORE });
  }

  // Local fallback.
  return NextResponse.json({ ...getDb(), ...flags, authed: false }, { headers: NO_STORE });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFullDb } from "@/lib/supabase/store";
import { stripeMode } from "@/lib/billing";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  const superAdmin = await isSuperAdmin();
  const flags = {
    hasAi: Boolean(process.env.ANTHROPIC_API_KEY),
    hasAyrshare: Boolean(process.env.AYRSHARE_API_KEY),
    hasSupabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    stripeMode: stripeMode(),
    superAdmin,
  };

  // Multi-tenant: serve the logged-in user's company from Supabase.
  const mine = await getFullDb();
  if (mine) {
    // Super admins get every tool unlocked — report the top tier so the
    // tier-gating (FeatureGate) opens all dashboard features.
    const company = superAdmin ? { ...(mine.company as Record<string, unknown>), tier: "pro" } : mine.company;
    return NextResponse.json({ ...mine, company, ...flags, authed: true });
  }

  // Local fallback.
  return NextResponse.json({ ...getDb(), ...flags, authed: false });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFullDb, getMyRole } from "@/lib/supabase/store";
import { stripeMode } from "@/lib/billing";
import { isSuperAdmin, IROS_FEATURES } from "@/lib/platform";
import { resolveCompanyCapabilities } from "@/lib/authz/resolve";
import { ALL_CAPABILITIES } from "@/lib/authz/capabilities";
import { countOpenQuestions } from "@/lib/board";

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

  // Per-user role on their company — drives admin-only UI (e.g. read-only Settings
  // for members). Admin in demo/no-auth mode so local dev keeps working.
  const role = await getMyRole();

  // Multi-tenant: serve the logged-in user's company from Supabase.
  const mine = await getFullDb();
  if (mine) {
    const co = mine.company as Record<string, unknown> & { id?: string; tier?: string };
    // THE canonical capability map — the exact same resolver server capability
    // guards use (lib/authz). `capabilities` now spans BOTH tier features and IROS
    // flags (unioned), so FeatureGate can gate ANY feature from one truth instead
    // of recomputing from a rewritten tier. We NO LONGER fake tier:"pro" — the real
    // tier is reported and fullAccess/capabilities carry the access answer.
    const cap = co.id
      ? await resolveCompanyCapabilities(String(co.id), co.tier, { knownSuperAdmin: superAdmin })
      : { fullAccess: superAdmin, comped: false, tier: "free" as const, capabilities: Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, superAdmin])) };
    // Unanswered investor questions on the company's public board — drives the badge
    // on Home + the Reputation nav. Best-effort so it never blocks the dashboard.
    let openQuestions = 0;
    const coTicker = String(co.ticker ?? "").trim();
    if (coTicker) { try { openQuestions = await countOpenQuestions(coTicker); } catch { /* ignore */ } }
    return NextResponse.json(
      { ...mine, company: co, ...flags, role, authed: true, fullAccess: cap.fullAccess, capabilities: cap.capabilities, openQuestions },
      { headers: NO_STORE }
    );
  }

  // Local fallback — no auth means no gating; report all capabilities on.
  const allOn = Object.fromEntries(ALL_CAPABILITIES.map((c) => [c, true])) as Record<string, boolean>;
  return NextResponse.json({ ...getDb(), ...flags, authed: false, fullAccess: true, capabilities: allOn }, { headers: NO_STORE });
}

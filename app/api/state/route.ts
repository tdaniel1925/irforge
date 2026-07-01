import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getFullDb, getMyRole } from "@/lib/supabase/store";
import { stripeMode } from "@/lib/billing";
import { isSuperAdmin, effectiveCompanyAccess, IROS_FEATURES } from "@/lib/platform";
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
    const co = mine.company as Record<string, unknown> & { id?: string };
    // The AUTHORITATIVE access answer — the same one the API gates use. This makes
    // the client agree with the server on comped/full-access (previously /api/state
    // used `co.comped` while the API used subscription_status, so they could
    // disagree and produce a click -> 403).
    const access = co.id ? await effectiveCompanyAccess(String(co.id)) : { fullAccess: superAdmin, comped: false, features: Object.fromEntries(IROS_FEATURES.map((f) => [f.key, superAdmin])) as Record<string, boolean> };
    // Full-access companies report the top tier so tier-gating (FeatureGate) opens
    // every dashboard tool. `capabilities` carries the per-capability truth so the UI
    // can disable/explain a specific blocked ACTION before the user clicks.
    const company = access.fullAccess ? { ...co, tier: "pro" } : co;
    // Unanswered investor questions on the company's public board — drives the badge
    // on Home + the Reputation nav. Best-effort so it never blocks the dashboard.
    let openQuestions = 0;
    const coTicker = String(co.ticker ?? "").trim();
    if (coTicker) { try { openQuestions = await countOpenQuestions(coTicker); } catch { /* ignore */ } }
    return NextResponse.json(
      { ...mine, company, ...flags, role, authed: true, fullAccess: access.fullAccess, capabilities: access.features, openQuestions },
      { headers: NO_STORE }
    );
  }

  // Local fallback — no auth means no gating; report all capabilities on.
  const allOn = Object.fromEntries(IROS_FEATURES.map((f) => [f.key, true])) as Record<string, boolean>;
  return NextResponse.json({ ...getDb(), ...flags, authed: false, fullAccess: true, capabilities: allOn }, { headers: NO_STORE });
}

import { getDb } from "@/lib/db";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Verified by PubcoZone" trust seal — companies show it on their IR site once
// they've claimed their page (URL matches what EmbedCenter emits — NO .svg suffix;
// a ".svg" on this literal segment would 404):
//   <img src="https://pubcozone.com/api/badge/BQST/verified" alt="Verified by PubcoZone">
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.replace(/\.svg$/i, "").toUpperCase().slice(0, 8);

  // Claimed = a real onboarded company owns this ticker in Supabase. The old code
  // read the local demo store (empty in production), so EVERY paying customer's
  // embedded badge rendered "Claim this page" on their own IR site.
  let claimed = false;
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data } = await createServiceClient()
        .from("companies")
        .select("id")
        .ilike("ticker", ticker)
        .eq("onboarding_complete", true)
        .limit(1)
        .maybeSingle();
      claimed = Boolean(data);
    } else {
      // Local demo (no Supabase): fall back to the single-company JSON store.
      claimed = getDb().company.ticker.toUpperCase() === ticker;
    }
  } catch {
    /* default not claimed */
  }

  const accent = claimed ? "#10b981" : "#64748b";
  const line2 = claimed ? "Verified company" : "Claim this page";
  const mark = claimed ? "✓" : "";

  const W = 230, H = 56;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${claimed ? "Verified by PubcoZone" : "PubcoZone page"} for $${ticker}">
  <rect width="${W}" height="${H}" rx="11" fill="#04060c"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="${accent}" stroke-opacity="0.55"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <circle cx="34" cy="${H / 2}" r="16" fill="${accent}" fill-opacity="0.15" stroke="${accent}" stroke-width="2"/>
    <text x="34" y="${H / 2 + 1}" fill="${accent}" font-size="18" font-weight="800" text-anchor="middle" dominant-baseline="central">${mark || "·"}</text>
    <text x="62" y="23" fill="#cbd5e1" font-size="11" letter-spacing="0.5">${claimed ? "VERIFIED BY" : "TRACKED ON"}</text>
    <text x="62" y="42" font-size="15" font-weight="800"><tspan fill="#ecfdf5">Pubco</tspan><tspan fill="#34d399">Zone</tspan><tspan fill="#cbd5e1" font-weight="500" font-size="11"> · $${ticker}</tspan></text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}

import { getPublicTickerAudit } from "@/lib/tickerCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRADE_HEX: Record<string, string> = {
  A: "#10b981",
  B: "#0ea5e9",
  C: "#f59e0b",
  D: "#f97316",
  F: "#ef4444",
};

// Embeddable SVG badge companies paste on their own IR site:
//   <img src="https://pubcozone.com/api/badge/BQST.svg" alt="PubcoZone Visibility Grade">
// Free backlinks + brand spread, and a live grade that updates itself.
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.replace(/\.svg$/i, "").toUpperCase().slice(0, 8);

  let grade = "?";
  let score: number | null = null;
  try {
    const audit = await getPublicTickerAudit(ticker);
    grade = audit.grade;
    score = audit.score;
  } catch {
    // render an unknown badge rather than failing
  }

  const color = GRADE_HEX[grade] ?? "#64748b";
  const scoreText = score !== null ? `${score}/100` : "live";
  const W = 248, H = 60;
  const cx = W - 36;

  // Grade in the ring; score sits OUTSIDE the ring (to its left) in light text so
  // it's always legible on the dark badge.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="PubcoZone Visibility Grade ${grade}, ${scoreText}">
  <rect width="${W}" height="${H}" rx="11" fill="#04060c"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="none" stroke="${color}" stroke-opacity="0.55"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="18" y="24" fill="#ecfdf5" font-size="15" font-weight="700">Pubco<tspan fill="#34d399">Zone</tspan></text>
    <text x="18" y="42" fill="#cbd5e1" font-size="11">$${ticker} · Score ${scoreText}</text>
    <circle cx="${cx}" cy="${H / 2}" r="20" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="3"/>
    <text x="${cx}" y="${H / 2}" fill="${color}" font-size="23" font-weight="800" text-anchor="middle" dominant-baseline="central">${grade}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Cache at the edge for 15 min (matches the audit TTL), allow stale while revalidating.
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}

import { getPublicTickerAudit } from "@/lib/tickerCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Live price chip — one-line SVG companies embed on their IR site:
//   <img src="https://pubcozone.com/api/badge/BQST/price.svg" alt="$BQST price">
// Auto-updates (15-min cache). Reuses the same audit data as the report page.
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.replace(/\.svg$/i, "").toUpperCase().slice(0, 8);

  let price: number | null = null;
  let changePct: number | null = null;
  let currency = "USD";
  try {
    const a = await getPublicTickerAudit(ticker);
    if (typeof a.market.price === "number") price = a.market.price;
    if (typeof a.market.changePct3mo === "number") changePct = a.market.changePct3mo;
    if (a.market.currency) currency = a.market.currency;
  } catch {
    /* render unknown */
  }

  const up = (changePct ?? 0) >= 0;
  const move = up ? "#10b981" : "#ef4444";
  const arrow = up ? "▲" : "▼";
  const priceText = price !== null ? `${currency === "USD" ? "$" : ""}${price.toFixed(price < 1 ? 4 : 2)}${currency !== "USD" ? " " + currency : ""}` : "—";
  const changeText = changePct !== null ? `${arrow} ${Math.abs(changePct).toFixed(1)}%` : "live";

  const W = 230, H = 44;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="$${ticker} ${priceText} ${changeText}">
  <rect width="${W}" height="${H}" rx="9" fill="#04060c"/>
  <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="8" fill="none" stroke="#1e293b"/>
  <g font-family="Segoe UI, Helvetica, Arial, sans-serif">
    <text x="14" y="${H / 2}" fill="#94a3b8" font-size="13" font-weight="700" dominant-baseline="central">$${ticker}</text>
    <text x="${W - 14}" y="${H / 2}" text-anchor="end" dominant-baseline="central">
      <tspan fill="#e2e8f0" font-size="14" font-weight="700">${priceText}</tspan>
      <tspan fill="${move}" font-size="12" font-weight="700" dx="8">${changeText}</tspan>
    </text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Prices move — shorter cache than the grade badge.
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
    },
  });
}

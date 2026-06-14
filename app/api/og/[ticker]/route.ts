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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Hand-built SVG social card (1200x630). No font-file dependency, so it renders
// identically on every host AND in local dev — unlike next/og, which breaks when
// the project path contains spaces. Every shared /t/TICKER link becomes an ad.
export async function GET(_req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.replace(/\.(svg|png)$/i, "").toUpperCase().slice(0, 8);

  let grade = "?";
  let score: number | null = null;
  let companyName = "";
  let price: number | null = null;
  let changePct: number | null = null;
  let series: number[] = [];
  try {
    const a = await getPublicTickerAudit(ticker);
    grade = a.grade;
    score = a.score;
    companyName = a.companyName ?? "";
    if (typeof a.market.price === "number") price = a.market.price;
    if (typeof a.market.changePct3mo === "number") changePct = a.market.changePct3mo;
    if (a.market.priceSeries && a.market.priceSeries.length > 2) series = a.market.priceSeries;
  } catch {
    /* minimal card */
  }

  const color = GRADE_HEX[grade] ?? "#64748b";
  const up = (changePct ?? 0) >= 0;
  const W = 1200, H = 630;

  // Sparkline path (bottom-right region)
  let spark = "";
  if (series.length > 2) {
    const sx = 720, sy = 430, sw = 400, sh = 120;
    const min = Math.min(...series), max = Math.max(...series), range = max - min || 1;
    const pts = series.map((v, i) => {
      const x = sx + (i / (series.length - 1)) * sw;
      const y = sy + sh - ((v - min) / range) * sh;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    spark = `<polyline points="${pts.join(" ")}" fill="none" stroke="${up ? "#34d399" : "#f87171"}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
  }

  const priceLine =
    price !== null
      ? `<text x="430" y="430" fill="#e2e8f0" font-size="52" font-weight="700">$${price.toFixed(2)}</text>` +
        (changePct !== null
          ? `<text x="430" y="478" fill="${up ? "#34d399" : "#f87171"}" font-size="36" font-weight="700">${up ? "+" : "-"}${Math.abs(changePct).toFixed(1)}% / 3mo</text>`
          : "")
      : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="80%">
      <stop offset="0%" stop-color="#0b2a22"/>
      <stop offset="55%" stop-color="#04060c"/>
      <stop offset="100%" stop-color="#04060c"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- wordmark -->
  <text x="72" y="92" font-size="34" font-weight="800">
    <tspan fill="#ecfdf5">Pubco</tspan><tspan fill="#34d399">Zone.</tspan>
    <tspan fill="#64748b" font-size="24" font-weight="500" dx="18">Investor Visibility Report</tspan>
  </text>

  <!-- grade ring -->
  <g>
    <rect x="72" y="200" width="300" height="300" rx="40" fill="none" stroke="${color}" stroke-width="8"/>
    <text x="222" y="380" fill="${color}" font-size="170" font-weight="800" text-anchor="middle">${grade}</text>
    ${score !== null ? `<text x="222" y="445" fill="#94a3b8" font-size="34" text-anchor="middle">${score}/100</text>` : ""}
  </g>

  <!-- ticker + company -->
  <text x="430" y="300" fill="#ffffff" font-size="96" font-weight="800">$${esc(ticker)}</text>
  ${companyName ? `<text x="432" y="350" fill="#cbd5e1" font-size="34">${esc(companyName.slice(0, 40))}</text>` : ""}
  ${priceLine}
  ${spark}

  <!-- footer -->
  <text x="72" y="588" fill="#94a3b8" font-size="27">Live SEC filings · financials · insider + short data · AI analysis · pubcozone.com</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}

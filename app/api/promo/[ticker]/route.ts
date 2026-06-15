import { getPublicTickerAudit } from "@/lib/tickerCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Branded promo graphics a company shares to announce "we're answering on the
// record at PubcoZone". Sizes via ?type=  (card | xheader | linkedin).
//   <img src="https://pubcozone.com/api/promo/BQST?type=card">
const SIZES: Record<string, { w: number; h: number }> = {
  card: { w: 1200, h: 630 },
  xheader: { w: 1500, h: 500 },
  linkedin: { w: 1584, h: 396 },
};

export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.replace(/\.(svg|png)$/i, "").toUpperCase().slice(0, 8);
  const type = new URL(req.url).searchParams.get("type") ?? "card";
  const { w, h } = SIZES[type] ?? SIZES.card;

  let name = "";
  try {
    const a = await getPublicTickerAudit(ticker);
    name = a.companyName ?? "";
  } catch { /* ticker only */ }

  const headline = "We answer — on the record.";
  const sub = `Real, fair, AI-balanced investor info for $${ticker}. Not the pump-and-dump.`;
  const cta = `pubcozone.com/welcome/${ticker}`;

  // Layout scales by aspect: banners are short+wide, the card is tall.
  const tall = h / w > 0.4;
  const padX = Math.round(w * 0.06);
  const titleSize = tall ? 76 : 60;
  const subSize = tall ? 32 : 28;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Segoe UI, Helvetica, Arial, sans-serif">
  <defs><radialGradient id="g" cx="25%" cy="15%" r="90%"><stop offset="0%" stop-color="#0b2a22"/><stop offset="60%" stop-color="#04060c"/><stop offset="100%" stop-color="#04060c"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <text x="${padX}" y="${tall ? 92 : 70}" font-size="30" font-weight="800"><tspan fill="#ecfdf5">Pubco</tspan><tspan fill="#34d399">Zone.</tspan></text>
  <text x="${padX}" y="${h / 2 + (tall ? 0 : 6)}" fill="#ffffff" font-size="${titleSize}" font-weight="800">${headline}</text>
  <text x="${padX}" y="${h / 2 + titleSize * 0.9}" fill="#cbd5e1" font-size="${subSize}">${esc(sub)}</text>
  ${name ? `<text x="${padX}" y="${h - (tall ? 110 : 52)}" fill="#64748b" font-size="${subSize - 2}">${esc(name)}</text>` : ""}
  <text x="${padX}" y="${h - (tall ? 56 : 26)}" fill="#34d399" font-size="${subSize}" font-weight="700">${cta}</text>
</svg>`;

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600, s-maxage=3600" },
  });
}

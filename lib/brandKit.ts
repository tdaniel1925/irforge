// Brand kit for templated post images. Centralizes a company's palette + mark so
// the image template (lib/postTemplate) renders a consistent, on-brand graphic.
//
// AMFN ("American Fusion") is the first brand. Others fall back to a neutral kit;
// the per-company brandColors field can refine the palette over time.

export interface BrandKit {
  navy: string;        // primary dark background
  navy2: string;       // panel / gradient stop
  red: string;         // accent
  blue: string;        // secondary accent (orbit)
  ink: string;         // headline text
  sub: string;         // body text
  panel: string;       // panel fill
  markSvgDataUri: string; // the atom-shield mark as a data: URI (for <img> in next/og)
}

// The American Fusion atom-shield: a crest shield with an atom (3 elliptical orbits
// + center star) — recreated as crisp vector SVG so it scales and needs no asset
// file or native image lib. Colors match the brand (navy shield, red+blue orbits).
function atomShieldSvg(opts: { shield: string; orbitRed: string; orbitBlue: string; star: string; stroke: string }): string {
  const { shield, orbitRed, orbitBlue, star, stroke } = opts;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 116" width="100" height="116">
  <path d="M50 4 L92 18 V58 C92 86 72 104 50 112 C28 104 8 86 8 58 V18 Z"
        fill="${shield}" stroke="${stroke}" stroke-width="3"/>
  <g transform="translate(50 58)" stroke-width="4" fill="none">
    <ellipse rx="34" ry="13" stroke="${orbitBlue}"/>
    <ellipse rx="34" ry="13" stroke="${orbitRed}" transform="rotate(60)"/>
    <ellipse rx="34" ry="13" stroke="${orbitBlue}" transform="rotate(120)"/>
    <polygon points="0,-9 2.6,-2.6 9,-2.6 3.8,1.6 5.9,8.5 0,4.3 -5.9,8.5 -3.8,1.6 -9,-2.6 -2.6,-2.6"
             fill="${star}" stroke="none"/>
  </g>
</svg>`.trim();
}

function svgDataUri(svg: string): string {
  // next/og <img> accepts data: URIs. Base64 keeps it robust across encoders.
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

// Palette tuned to the American Fusion mark: a deep navy crest, a strong brand red,
// and light steel-blue orbit/accents.
const AMFN: BrandKit = {
  navy: "#0a1733",   // deep crest navy (background base)
  navy2: "#102652",  // lighter navy for gradient/panel
  red: "#d11f2a",    // brand red (orbit / accents)
  blue: "#4a7fc0",   // steel-blue accent
  ink: "#f5f8fc",    // headline
  sub: "#aebfdc",    // body
  panel: "#13284f",  // text panel fill
  markSvgDataUri: svgDataUri(
    atomShieldSvg({ shield: "#102652", orbitRed: "#d11f2a", orbitBlue: "#cfe0f6", star: "#cfe0f6", stroke: "#4a7fc0" })
  ),
};

const NEUTRAL: BrandKit = {
  navy: "#111827",
  navy2: "#1f2937",
  red: "#10b981",
  blue: "#38bdf8",
  ink: "#f8fafc",
  sub: "#cbd5e1",
  panel: "#1e293b",
  markSvgDataUri: svgDataUri(
    atomShieldSvg({ shield: "#1f2937", orbitRed: "#10b981", orbitBlue: "#cbd5e1", star: "#cbd5e1", stroke: "#38bdf8" })
  ),
};

// Resolve a brand kit for a company. AMFN gets its real palette; everyone else gets
// the neutral kit (still branded/consistent). Ticker match is case-insensitive.
export function getBrandKit(ticker?: string): BrandKit {
  return String(ticker ?? "").toUpperCase() === "AMFN" ? AMFN : NEUTRAL;
}

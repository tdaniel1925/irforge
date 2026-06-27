import { ImageResponse } from "next/og";
import { getBrandKit } from "@/lib/brandKit";

export const runtime = "edge";

// Renders a BRANDED post image: an AI-generated background art layer with the
// company's atom-shield mark, brand bar, and REAL text overlaid (crisp, never the
// garbled text AI produces). next/og (Satori) renders JSX → PNG natively on Vercel,
// so there's no native image dependency.
//
// GET params:
//   bg        — public URL of the AI background art (optional; falls back to a brand gradient)
//   layout    — announcement | stat | quote | filing
//   ticker    — drives the brand kit (e.g. AMFN)
//   company   — display name (e.g. "American Fusion")
//   title     — headline / stat value / quote
//   body      — supporting line(s)
//   label     — small label (e.g. stat label, attribution, filing form)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const bg = p.get("bg") || "";
  const layout = (p.get("layout") || "announcement").toLowerCase();
  const ticker = (p.get("ticker") || "").toUpperCase();
  const company = p.get("company") || ticker || "Company";
  const title = (p.get("title") || "").slice(0, 220);
  const body = (p.get("body") || "").slice(0, 300);
  const label = (p.get("label") || "").slice(0, 60);

  const b = getBrandKit(ticker);
  const SIZE = 1080;

  // Shared chrome: full-bleed AI background (or brand gradient), a dark scrim for
  // text legibility, the logo mark + company name top-left, a ticker chip top-right.
  const Background = bg
    ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" }
    : { backgroundImage: `linear-gradient(135deg, ${b.navy} 0%, ${b.navy2} 100%)` };

  const TopBar = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={b.markSvgDataUri} width={64} height={74} alt="" />
        <span style={{ fontSize: 34, fontWeight: 800, color: b.ink, letterSpacing: -0.5 }}>{company}</span>
      </div>
      {ticker ? (
        <span style={{ fontSize: 26, fontWeight: 700, color: b.ink, background: b.red, padding: "8px 18px", borderRadius: 999 }}>${ticker}</span>
      ) : <span />}
    </div>
  );

  // Per-layout content block.
  let Content;
  if (layout === "stat") {
    Content = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <span style={{ fontSize: 168, fontWeight: 900, color: b.ink, lineHeight: 1 }}>{title || "—"}</span>
        {label ? <span style={{ fontSize: 40, fontWeight: 700, color: b.red, textTransform: "uppercase", letterSpacing: 1 }}>{label}</span> : null}
        {body ? <span style={{ fontSize: 34, color: b.sub, marginTop: 8 }}>{body}</span> : null}
      </div>
    );
  } else if (layout === "quote") {
    Content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <span style={{ fontSize: 120, fontWeight: 900, color: b.red, lineHeight: 0.6 }}>“</span>
        <span style={{ fontSize: 52, fontWeight: 700, color: b.ink, lineHeight: 1.25 }}>{title}</span>
        {label ? <span style={{ fontSize: 32, color: b.sub }}>— {label}</span> : null}
      </div>
    );
  } else if (layout === "filing") {
    Content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {label ? <span style={{ alignSelf: "flex-start", fontSize: 28, fontWeight: 800, color: b.navy, background: b.ink, padding: "6px 16px", borderRadius: 8, textTransform: "uppercase" }}>{label}</span> : null}
        <span style={{ fontSize: 58, fontWeight: 800, color: b.ink, lineHeight: 1.15 }}>{title}</span>
        {body ? <span style={{ fontSize: 34, color: b.sub, lineHeight: 1.3 }}>{body}</span> : null}
      </div>
    );
  } else {
    // announcement (default)
    Content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {label ? <span style={{ alignSelf: "flex-start", fontSize: 26, fontWeight: 700, color: b.red, textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</span> : null}
        <span style={{ fontSize: 64, fontWeight: 800, color: b.ink, lineHeight: 1.15 }}>{title}</span>
        {body ? <span style={{ fontSize: 36, color: b.sub, lineHeight: 1.35 }}>{body}</span> : null}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: SIZE, height: SIZE, padding: 64, ...Background }}>
        {/* dark scrim for legibility over photographic/colorful AI art */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${b.navy}cc 0%, ${b.navy}66 35%, ${b.navy}cc 100%)` }} />
        <div style={{ display: "flex", position: "relative" }}>{TopBar}</div>
        {/* content sits in a translucent brand panel for contrast */}
        <div style={{ display: "flex", position: "relative", background: `${b.panel}e6`, borderLeft: `8px solid ${b.red}`, borderRadius: 18, padding: 40, maxWidth: SIZE - 128 }}>
          {Content}
        </div>
        {/* footer brand strip */}
        <div style={{ display: "flex", position: "relative", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: b.sub, letterSpacing: 2, textTransform: "uppercase" }}>{company} · Investor Update</span>
        </div>
      </div>
    ),
    { width: SIZE, height: SIZE }
  );
}

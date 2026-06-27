import { ImageResponse } from "next/og";
import { getBrandKit } from "@/lib/brandKit";

export const runtime = "edge";

// Renders a BRANDED post image: an AI-generated background art layer with the
// company's atom-shield mark, brand bar, and REAL text overlaid (crisp, never the
// garbled text AI produces). next/og (Satori) renders JSX → PNG natively on Vercel,
// so there's no native image dependency.
//
// Inputs (via GET query params for direct previews, or POST JSON for server use):
//   bg        — AI background: a public URL OR a data:image/...;base64 URI
//               (optional; falls back to a brand gradient)
//   layout    — announcement | stat | quote | filing
//   ticker    — drives the brand kit (e.g. AMFN)
//   company   — display name (e.g. "American Fusion")
//   title     — headline / stat value / quote
//   body      — supporting line(s)
//   label     — small label (e.g. stat label, attribution, filing form)
interface TemplateOpts { bg?: string; layout?: string; ticker?: string; company?: string; title?: string; body?: string; label?: string }

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  return render({
    bg: p.get("bg") || "", layout: p.get("layout") || "", ticker: p.get("ticker") || "",
    company: p.get("company") || "", title: p.get("title") || "", body: p.get("body") || "", label: p.get("label") || "",
  });
}

export async function POST(req: Request) {
  const o = (await req.json().catch(() => ({}))) as TemplateOpts;
  return render(o);
}

function render(o: TemplateOpts) {
  const bg = o.bg || "";
  const layout = (o.layout || "announcement").toLowerCase();
  const ticker = (o.ticker || "").toUpperCase();
  const company = o.company || ticker || "Company";
  const title = (o.title || "").slice(0, 220);
  const body = (o.body || "").slice(0, 300);
  const label = (o.label || "").slice(0, 60);

  const b = getBrandKit(ticker);
  const SIZE = 1080;

  // The container ALWAYS gets the brand gradient (Satori renders linear-gradients).
  // The AI art is layered as a full-bleed <img> below — because Satori does NOT
  // support raster `backgroundImage: url(...)`; it only paints images via <img>.
  // (That's why composites were coming out gradient/blank — this is the real fix.)
  const Background = { backgroundImage: `linear-gradient(135deg, ${b.navy} 0%, ${b.navy2} 100%)` };

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
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {label ? <span style={{ alignSelf: "flex-start", fontSize: 24, fontWeight: 800, color: "#ffffff", background: b.red, padding: "7px 16px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 1.5 }}>{label}</span> : null}
        <span style={{ fontSize: 64, fontWeight: 800, color: b.ink, lineHeight: 1.15 }}>{title}</span>
        {body ? <span style={{ fontSize: 36, color: b.sub, lineHeight: 1.35 }}>{body}</span> : null}
      </div>
    );
  }

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: SIZE, height: SIZE, padding: 64, ...Background }}>
        {/* AI background art as a full-bleed <img> (Satori only paints images this
            way, not via CSS backgroundImage). Sits below the scrim + content. */}
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} width={SIZE} height={SIZE} alt="" style={{ position: "absolute", top: 0, left: 0, width: SIZE, height: SIZE, objectFit: "cover" }} />
        ) : null}
        {/* LIGHT scrim — just enough to keep the top bar + footer legible while
            letting the AI tech-pattern background show through. */}
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, ${b.navy}99 0%, ${b.navy}22 30%, ${b.navy}22 65%, ${b.navy}99 100%)` }} />
        <div style={{ display: "flex", position: "relative" }}>{TopBar}</div>
        {/* Content sits in a near-SOLID brand panel (with a soft shadow) so the text
            stays crisp regardless of how busy the background art is. */}
        <div style={{ display: "flex", position: "relative", background: `${b.panel}f7`, borderLeft: `10px solid ${b.red}`, borderRadius: 18, padding: 44, maxWidth: SIZE - 128, boxShadow: `0 20px 60px ${b.navy}cc` }}>
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

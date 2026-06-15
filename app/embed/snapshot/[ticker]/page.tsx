import { getPublicTickerAudit } from "@/lib/tickerCache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Embeddable stock-snapshot card (drop into an IR site via <iframe>).
export default async function SnapshotEmbed({ params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase().slice(0, 8);
  let audit;
  try {
    audit = await getPublicTickerAudit(ticker);
  } catch {
    audit = null;
  }

  const price = audit?.market.price ?? null;
  const change = audit?.market.changePct3mo ?? null;
  const up = (change ?? 0) >= 0;
  const series = audit?.market.priceSeries ?? [];
  const f = audit?.fundamentals;

  // Sparkline path
  let spark = "";
  if (series.length > 2) {
    const W = 300, H = 60, min = Math.min(...series), max = Math.max(...series), range = max - min || 1;
    const pts = series.map((v, i) => `${(i / (series.length - 1)) * W},${H - ((v - min) / range) * H}`);
    spark = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:60px"><polyline points="${pts.join(" ")}" fill="none" stroke="${up ? "#34d399" : "#f87171"}" stroke-width="2.5"/></svg>`;
  }

  const stat = (label: string, val: string) =>
    `<div style="text-align:center"><div style="font-size:11px;color:#64748b">${label}</div><div style="font-size:14px;font-weight:700;color:#e2e8f0">${val}</div></div>`;

  const money = (n?: number) => (typeof n === "number" ? (Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`) : "—");

  return (
    <div
      style={{ fontFamily: "system-ui, Segoe UI, sans-serif", background: "#04060c", borderRadius: 14, padding: 18, color: "#e2e8f0", maxWidth: 340 }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <span style={{ fontSize: 18, fontWeight: 800 }}>${audit?.ticker ?? ticker}</span>
        <span style={{ fontSize: 13, color: "#94a3b8" }}>{audit?.companyName?.slice(0, 22) ?? ""}</span>
      </div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 800 }}>{price !== null ? `$${price.toFixed(price < 1 ? 4 : 2)}` : "—"}</span>
        {change !== null && (
          <span style={{ fontSize: 14, fontWeight: 700, color: up ? "#34d399" : "#f87171" }}>{up ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%</span>
        )}
      </div>
      {spark && <div style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: spark }} />}
      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
        dangerouslySetInnerHTML={{
          __html:
            stat("Cash", money(f?.cash)) +
            stat("Shares", typeof f?.sharesOutstanding === "number" ? `${(f.sharesOutstanding / 1e6).toFixed(0)}M` : "—") +
            stat("Short", audit?.shortData ? `${audit.shortData.shortPct.toFixed(0)}%` : "—"),
        }}
      />
      <a href={`https://pubcozone.com/t/${ticker}`} target="_blank" rel="noreferrer"
        style={{ display: "block", marginTop: 14, textAlign: "center", fontSize: 11, color: "#64748b", textDecoration: "none" }}>
        Live data · Powered by <span style={{ color: "#34d399" }}>PubcoZone</span>
      </a>
    </div>
  );
}

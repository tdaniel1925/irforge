export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-range Yahoo Finance params. Short ranges use intraday intervals; long
// ranges use daily/weekly so the payload stays small and the line stays smooth.
const RANGES: Record<string, { range: string; interval: string }> = {
  "1D": { range: "1d", interval: "5m" },
  "5D": { range: "5d", interval: "15m" },
  "1M": { range: "1mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
  "5Y": { range: "5y", interval: "1wk" },
  "MAX": { range: "max", interval: "1mo" },
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = Math.ceil(arr.length / max);
  return arr.filter((_, i) => i % step === 0);
}

export async function GET(req: Request, { params }: { params: { ticker: string } }) {
  const ticker = params.ticker.toUpperCase().slice(0, 8);
  const url = new URL(req.url);
  const key = (url.searchParams.get("range") ?? "3M").toUpperCase();
  const cfg = RANGES[key] ?? RANGES["1M"];

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${cfg.range}&interval=${cfg.interval}`,
      { headers: { "User-Agent": UA }, signal: ctrl.signal, cache: "no-store" }
    );
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error("no chart data");

    const ts: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
    const vols: (number | null)[] = result.indicators?.quote?.[0]?.volume ?? [];

    // Keep only rows with a real close; carry timestamp + volume alongside.
    let points = ts
      .map((t, i) => ({ t, c: closes[i], v: vols[i] ?? 0 }))
      .filter((p): p is { t: number; c: number; v: number } => typeof p.c === "number");

    points = downsample(points, 120).map((p) => ({
      t: p.t,
      c: Math.round(p.c * 1e4) / 1e4,
      v: Math.round(p.v),
    }));

    const first = points[0]?.c;
    const last = points[points.length - 1]?.c;
    const changePct = first && last ? ((last - first) / first) * 100 : null;

    return Response.json(
      {
        range: key,
        currency: result.meta?.currency ?? "USD",
        changePct,
        points,
      },
      {
        headers: {
          // 1D/5D move intraday → short cache. Longer ranges cache longer.
          "Cache-Control": key === "1D" || key === "5D"
            ? "public, max-age=120, s-maxage=120, stale-while-revalidate=600"
            : "public, max-age=900, s-maxage=900, stale-while-revalidate=86400",
        },
      }
    );
  } catch (e) {
    return Response.json({ range: key, points: [], error: "unavailable" }, { status: 200 });
  }
}

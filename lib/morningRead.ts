// Lightweight "morning read" news fetch for the home dashboard. Pulls a few
// recent articles for the company (GDELT) — best-effort, fast-failing, never
// blocks the dashboard. No API key needed.

export interface ReadItem {
  title: string;
  url: string;
  source: string;
  date: string;
}

export async function getMorningRead(ticker: string, companyName?: string): Promise<ReadItem[]> {
  const name = (companyName || "").replace(/[.,]/g, "").replace(/\b(inc|corp|corporation|ltd|llc|co|company)\b/gi, "").trim();
  const q = name && name.length > 3 ? `"${name}"` : `"${ticker}"`;
  try {
    const res = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=6&timespan=7d&sort=datedesc&format=json`,
      { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "PubcoZone IR tool" } }
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const arts = Array.isArray(data?.articles) ? data.articles : [];
    return arts.slice(0, 4).map((a: Record<string, unknown>) => ({
      title: String(a.title ?? "").slice(0, 160),
      url: String(a.url ?? ""),
      source: String(a.domain ?? "").replace(/^www\./, ""),
      date: String(a.seendate ?? "").slice(0, 8),
    })).filter((x: ReadItem) => x.title && x.url);
  } catch {
    return [];
  }
}

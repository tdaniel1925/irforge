// Lightweight "morning read" news fetch for the home dashboard. Pulls a few
// recent articles for the company (GDELT) — best-effort, fast-failing, never
// blocks the dashboard. No API key needed.

export interface ReadItem {
  title: string;
  url: string;
  source: string;
  date: string;
}

export interface PodcastEpisode { title: string; url: string; show: string; date: string }

// Latest episode of a markets/IR podcast for the "morning listen". Parses an RSS
// feed (no key, best-effort). Defaults to a reputable markets show; override with
// PODCAST_RSS env. Returns null if unavailable so the widget hides cleanly.
export async function getPodcastEpisode(): Promise<PodcastEpisode | null> {
  const feed = process.env.PODCAST_RSS || "https://feeds.megaphone.fm/WWO8086402096"; // Bloomberg Daybreak (markets)
  try {
    const res = await fetch(feed, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "PubcoZone IR tool" } });
    if (!res.ok) return null;
    const xml = await res.text();
    const show = (xml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "Markets podcast").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    const item = xml.match(/<item>([\s\S]*?)<\/item>/i)?.[1] || "";
    const title = (item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    // Prefer the episode link; fall back to the enclosure audio URL.
    const link = (item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || item.match(/<enclosure[^>]*url="([^"]+)"/i)?.[1] || "").trim();
    const date = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "").trim();
    if (!title || !link) return null;
    return { title: title.slice(0, 160), url: link, show: show.slice(0, 80), date };
  } catch {
    return null;
  }
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

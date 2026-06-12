import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

// Live SEC press-release feed so the Learn library's "recent from the SEC" stays current.
export async function GET() {
  try {
    const res = await fetch("https://www.sec.gov/news/pressreleases.rss", {
      headers: { "User-Agent": "PubcoZone research contact@pubcozone.com" },
      signal: AbortSignal.timeout(9000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return NextResponse.json({ items: [], error: `SEC feed ${res.status}` });
    const xml = await res.text();
    const items: { title: string; link: string; date: string }[] = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null && items.length < 8) {
      const block = m[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] ?? "").trim();
      const link = (block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "").trim();
      const date = (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "").trim();
      if (title) items.push({ title, link, date: date.slice(0, 16) });
    }
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [], error: "SEC feed unreachable" });
  }
}

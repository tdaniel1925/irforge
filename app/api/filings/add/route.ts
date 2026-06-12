import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { Filing } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST — a claimed company adds a disclosure we can't reach via EDGAR
// (OTC/SEDAR alternative reporting). Accepts a URL to fetch, or pasted text.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const form = String(body.form ?? "").trim().slice(0, 20) || "Disclosure";
  const title = String(body.title ?? "").trim().slice(0, 200);
  const url = String(body.url ?? "").trim().slice(0, 500);
  let text = String(body.text ?? "").trim();
  const date = String(body.date ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!title) return NextResponse.json({ error: "Give the disclosure a title." }, { status: 422 });

  // If a URL is provided and no text, fetch and strip it server-side.
  if (url && !text) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "PubcoZone IR disclosure importer (company-authorized)" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return NextResponse.json({ error: `Couldn't fetch that URL (HTTP ${res.status}). Paste the text instead.` }, { status: 422 });
      const html = await res.text();
      text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch {
      return NextResponse.json({ error: "Couldn't reach that URL. Paste the disclosure text instead." }, { status: 422 });
    }
  }

  if (!text || text.length < 40) {
    return NextResponse.json({ error: "Provide a working URL or paste at least a paragraph of the disclosure." }, { status: 422 });
  }

  const fullText = text.slice(0, 8000);
  const summary = fullText.slice(0, 400) + (fullText.length > 400 ? "…" : "");

  const { db, save } = await getStore();
  const filing: Filing = {
    id: newId("cmp"),
    form,
    title,
    filedAt: new Date(date).toISOString(),
    url: url || "",
    summary,
    source: "company",
    fullText,
  };
  db.filings = [filing, ...db.filings].sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "FILING_ADDED", `Company-provided disclosure: ${form} — ${title}`);
  await save();

  return NextResponse.json(filing);
}

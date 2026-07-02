import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { safeFetchText } from "@/lib/safeFetch";
import type { Filing } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST — a claimed company adds a disclosure we can't reach via EDGAR
// (OTC/SEDAR alternative reporting). Accepts a URL to fetch, or pasted text.
export async function POST(req: Request) {
  // Auth gate: this fetches a URL + writes to the company's filings.
  const { db, save, authed } = await getStore();
  if (process.env.AUTH_ENABLED === "1" && !authed) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const form = String(body.form ?? "").trim().slice(0, 20) || "Disclosure";
  const title = String(body.title ?? "").trim().slice(0, 200);
  const url = String(body.url ?? "").trim().slice(0, 500);
  let text = String(body.text ?? "").trim().slice(0, 100_000);
  const date = String(body.date ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!title) return NextResponse.json({ error: "Give the disclosure a title." }, { status: 422 });

  // If a URL is provided and no text, fetch and strip it server-side (SSRF-guarded —
  // an arbitrary user URL must not reach internal/metadata hosts).
  if (url && !text) {
    const r = await safeFetchText(url);
    if (!r.ok) return NextResponse.json({ error: `${r.error ?? "Couldn't fetch that URL."} Paste the text instead.` }, { status: 422 });
    text = r.text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  if (!text || text.length < 40) {
    return NextResponse.json({ error: "Provide a working URL or paste at least a paragraph of the disclosure." }, { status: 422 });
  }

  const fullText = text.slice(0, 8000);
  const summary = fullText.slice(0, 400) + (fullText.length > 400 ? "…" : "");

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

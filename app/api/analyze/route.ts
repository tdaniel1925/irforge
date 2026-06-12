import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import { analyzeDocument } from "@/lib/ai";
import type { DocAnalysis } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST — analyze a pasted document or a URL we fetch + strip.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const docName = String(b.docName ?? "Document").slice(0, 160);
  let text = String(b.text ?? "").trim();
  const url = String(b.url ?? "").trim();

  if (url && !text) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "PubcoZone analyzer contact@pubcozone.com" }, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        text = (await res.text())
          .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
      }
    } catch {
      /* fall through to text check */
    }
  }

  if (text.length < 40) return NextResponse.json({ error: "Paste at least a paragraph, or give a working link." }, { status: 422 });

  const { db, save } = await getStore();
  const r = await analyzeDocument(docName, text, db.company);
  const analysis: DocAnalysis = {
    id: newId("anl"),
    docName,
    summary: r.summary,
    keyTerms: r.keyTerms,
    risks: r.risks,
    disclosureTrigger: r.disclosureTrigger,
    createdAt: new Date().toISOString(),
    engine: r.engine,
  };
  db.docAnalyses.unshift(analysis);
  logAudit(db, "user", "DOC_ANALYZED", `Analyzed: ${docName} → ${r.disclosureTrigger}`);
  await save();
  return NextResponse.json(analysis);
}

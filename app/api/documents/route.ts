import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { CompanyDoc } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — add a document (link or, in the demo, a name+note). Real file upload uses
// Supabase Storage once auth is on; here we store the metadata + an optional URL.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 160);
  if (!name) return NextResponse.json({ error: "Document name required." }, { status: 422 });

  const { db, save } = await getStore();
  const doc: CompanyDoc = {
    id: newId("doc"),
    name,
    category: ["filing", "governance", "financing", "policy", "ir_material", "other"].includes(b.category) ? b.category : "other",
    url: b.url ? String(b.url).slice(0, 500) : undefined,
    note: b.note ? String(b.note).slice(0, 400) : undefined,
    filedDate: b.filedDate ? String(b.filedDate).slice(0, 10) : undefined,
    uploadedAt: new Date().toISOString(),
    source: b.url ? "link" : "uploaded",
  };
  db.documents.unshift(doc);
  logAudit(db, "user", "DOCUMENT_ADDED", `Added document: ${name} (${doc.category})`);
  await save();
  return NextResponse.json(doc);
}

// PATCH — delete (or, optionally, import all EDGAR filings into the vault).
export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { db, save } = await getStore();

  if (b.action === "delete") {
    db.documents = db.documents.filter((d) => d.id !== b.id);
  }

  if (b.action === "import_filings") {
    const existing = new Set(db.documents.map((d) => d.name));
    let added = 0;
    for (const f of db.filings) {
      const nm = `${f.form} — ${f.title}`.slice(0, 160);
      if (existing.has(nm)) continue;
      db.documents.unshift({
        id: newId("doc"),
        name: nm,
        category: "filing",
        url: f.url,
        filedDate: f.filedAt.slice(0, 10),
        uploadedAt: new Date().toISOString(),
        source: f.source === "edgar" ? "edgar" : "link",
      });
      added++;
    }
    logAudit(db, "user", "DOCUMENTS_IMPORTED", `Imported ${added} filing(s) into the vault`);
  }

  await save();
  return NextResponse.json({ ok: true, documents: db.documents });
}

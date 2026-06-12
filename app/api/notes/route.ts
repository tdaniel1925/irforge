import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { ConvertibleNote } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const holder = String(b.holder ?? "").trim().slice(0, 120);
  const principal = Number(b.principal) || 0;
  if (!holder || principal <= 0) return NextResponse.json({ error: "Holder and principal are required." }, { status: 422 });

  const { db, save } = await getStore();
  const note: ConvertibleNote = {
    id: newId("note"),
    holder,
    principal,
    issueDate: String(b.issueDate ?? "").slice(0, 10),
    maturityDate: String(b.maturityDate ?? "").slice(0, 10),
    interestRate: Number(b.interestRate) || 0,
    conversionType: b.conversionType === "variable" ? "variable" : "fixed",
    conversionPrice: b.conversionPrice ? Number(b.conversionPrice) : undefined,
    discountPct: b.discountPct ? Number(b.discountPct) : undefined,
    note: b.note ? String(b.note).slice(0, 300) : undefined,
    status: "outstanding",
  };
  db.convertibleNotes.unshift(note);
  logAudit(db, "user", "NOTE_ADDED", `Convertible note: $${principal.toLocaleString()} to ${holder}`);
  await save();
  return NextResponse.json(note);
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { db, save } = await getStore();
  const n = db.convertibleNotes.find((x) => x.id === b.id);
  if (!n) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.action === "status" && b.status) n.status = b.status;
  if (b.action === "delete") db.convertibleNotes = db.convertibleNotes.filter((x) => x.id !== b.id);
  await save();
  return NextResponse.json({ ok: true, notes: db.convertibleNotes });
}

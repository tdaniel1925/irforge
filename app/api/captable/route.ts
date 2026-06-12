import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { CapTableEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const holder = String(b.holder ?? "").trim().slice(0, 120);
  const shares = Number(b.shares) || 0;
  if (!holder || shares <= 0) return NextResponse.json({ error: "Holder and share count are required." }, { status: 422 });

  const { db, save } = await getStore();
  const entry: CapTableEntry = {
    id: newId("cap"),
    holder,
    class: ["common", "preferred", "insider", "options", "warrants"].includes(b.class) ? b.class : "common",
    shares,
    costBasis: b.costBasis ? Number(b.costBasis) : undefined,
    strikePrice: b.strikePrice ? Number(b.strikePrice) : undefined,
    contactId: b.contactId || undefined,
    intent: b.intent || "unknown",
    notes: b.notes ? String(b.notes).slice(0, 400) : undefined,
    updatedAt: new Date().toISOString(),
  };
  db.capTable.unshift(entry);
  logAudit(db, "user", "CAPTABLE_ADDED", `Cap table: ${holder} (${entry.class}, ${shares.toLocaleString()})`);
  await save();
  return NextResponse.json(entry);
}

export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { db, save } = await getStore();
  const e = db.capTable.find((x) => x.id === b.id);
  if (!e) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.action === "intent" && b.intent) e.intent = b.intent;
  if (b.action === "notes") e.notes = String(b.notes ?? "").slice(0, 400);
  if (b.action === "delete") db.capTable = db.capTable.filter((x) => x.id !== b.id);
  e.updatedAt = new Date().toISOString();
  await save();
  return NextResponse.json({ ok: true, capTable: db.capTable });
}

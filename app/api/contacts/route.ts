import { NextResponse } from "next/server";
import { getStore, logAudit, newId } from "@/lib/db";
import type { Contact, ContactInteraction } from "@/lib/types";

export const dynamic = "force-dynamic";

// POST — add a contact.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: "Name required." }, { status: 422 });

  const { db, save } = await getStore();
  const contact: Contact = {
    id: newId("con"),
    name,
    firm: b.firm ? String(b.firm).slice(0, 120) : undefined,
    type: ["fund", "analyst", "broker", "shareholder", "media", "advisor", "other"].includes(b.type) ? b.type : "other",
    email: b.email ? String(b.email).slice(0, 120) : undefined,
    phone: b.phone ? String(b.phone).slice(0, 40) : undefined,
    stage: "identified",
    peersHeld: Array.isArray(b.peersHeld) ? b.peersHeld.map((p: string) => String(p).toUpperCase()).slice(0, 8) : undefined,
    aum: b.aum ? String(b.aum).slice(0, 20) : undefined,
    notes: b.notes ? String(b.notes).slice(0, 500) : undefined,
    interactions: [],
    createdAt: new Date().toISOString(),
  };
  db.contacts.unshift(contact);
  logAudit(db, "user", "CONTACT_ADDED", `Added contact: ${name}`);
  await save();
  return NextResponse.json(contact);
}

// PATCH — update stage, add interaction, set follow-up, or delete.
export async function PATCH(req: Request) {
  const b = await req.json().catch(() => ({}));
  const { db, save } = await getStore();
  const c = db.contacts.find((x) => x.id === b.id);
  if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (b.action === "stage" && b.stage) c.stage = b.stage;
  if (b.action === "followup") c.nextFollowUp = b.date || undefined;
  if (b.action === "interaction" && b.summary) {
    const ix: ContactInteraction = { id: newId("int"), ts: new Date().toISOString(), kind: b.kind ?? "note", summary: String(b.summary).slice(0, 500) };
    c.interactions.unshift(ix);
    logAudit(db, "user", "CONTACT_INTERACTION", `${c.name}: ${ix.kind} logged`);
  }
  if (b.action === "delete") {
    db.contacts = db.contacts.filter((x) => x.id !== b.id);
  }
  await save();
  return NextResponse.json({ ok: true, contacts: db.contacts });
}

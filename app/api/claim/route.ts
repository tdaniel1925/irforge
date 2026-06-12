import { NextResponse } from "next/server";
import { addLead } from "@/lib/publicStats";
import { getStore, logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().slice(0, 120);
  const role = String(body.role ?? "").trim().slice(0, 60);

  if (!ticker || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter your name and a valid work email." }, { status: 422 });
  }

  addLead({ ticker, name, email, role, ts: new Date().toISOString() });

  const { db, save } = await getStore();
  logAudit(db, "public-site", "LEAD_CAPTURED", `$${ticker} claim request from ${name} (${role || "role n/a"})`);
  await save();

  return NextResponse.json({ ok: true });
}

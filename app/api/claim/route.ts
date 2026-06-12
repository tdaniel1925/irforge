import { NextResponse } from "next/server";
import { addLead, rateAllow } from "@/lib/publicStats";
import { getStore, logAudit } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "anon").trim();
  if (!(await rateAllow(`claim:${ip}`, 5))) return NextResponse.json({ error: "Too many requests — try again shortly." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const ticker = String(body.ticker ?? "").toUpperCase().slice(0, 8);
  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().slice(0, 120);
  const role = String(body.role ?? "").trim().slice(0, 60);

  if (!ticker || !name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter your name and a valid work email." }, { status: 422 });
  }

  await addLead({ ticker, name, email, role, ts: new Date().toISOString() });

  const { db, save } = await getStore();
  logAudit(db, "public-site", "LEAD_CAPTURED", `$${ticker} claim request from ${name} (${role || "role n/a"})`);
  await save();

  return NextResponse.json({ ok: true });
}

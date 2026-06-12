import { NextResponse } from "next/server";
import { getStore, logAudit } from "@/lib/db";
import { fetchEdgarFilings } from "@/lib/edgar";

export const dynamic = "force-dynamic";

export async function POST() {
  const { db, save } = await getStore();
  const result = await fetchEdgarFilings(db.company.cik);

  if ("error" in result) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  const known = new Set(db.filings.map((f) => f.id));
  const fresh = result.filter((f) => !known.has(f.id));
  db.filings = [...fresh, ...db.filings].sort((a, b) => b.filedAt.localeCompare(a.filedAt));

  if (fresh.length > 0) {
    logAudit(db, "system", "EDGAR_SYNC", `Pulled ${fresh.length} new filing(s) from EDGAR for CIK ${db.company.cik}`);
  }
  await save();
  return NextResponse.json({ ok: true, added: fresh.length });
}

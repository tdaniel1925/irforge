import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import { listContacts, upsertContact } from "@/lib/crm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST { rows: [{fullName,email,title,phone,category,aum,notes}, ...] }
// Imports contacts; skips duplicates by email (case-insensitive).
export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const rows: Record<string, string>[] = Array.isArray(b.rows) ? b.rows.slice(0, 5000) : [];
  if (!rows.length) return NextResponse.json({ error: "No rows to import." }, { status: 422 });

  const existing = await listContacts();
  const seen = new Set(existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean));

  let imported = 0, skipped = 0;
  for (const r of rows) {
    const fullName = (r.fullName ?? "").trim();
    const email = (r.email ?? "").trim().toLowerCase();
    if (!fullName && !email) { skipped++; continue; }
    if (email && seen.has(email)) { skipped++; continue; }
    const ok = await upsertContact({
      fullName: fullName || email,
      email,
      title: (r.title ?? "").trim(),
      phone: (r.phone ?? "").trim(),
      category: (r.category ?? "investor").trim() || "investor",
      aum: (r.aum ?? "").trim(),
      notes: (r.notes ?? "").trim(),
    });
    if (ok) { imported++; if (email) seen.add(email); } else skipped++;
  }

  return NextResponse.json({ ok: true, imported, skipped });
}

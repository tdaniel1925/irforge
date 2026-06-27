import { NextResponse } from "next/server";
import { getDb, logAudit, saveDb } from "@/lib/db";
import { getMyCompany, getMyRole, updateMyCompany } from "@/lib/supabase/store";
import type { Company } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const patch = (await req.json()) as Partial<Company>;

  // Multi-tenant path: if a user is logged in, write to their company row (RLS-scoped).
  const mine = await getMyCompany();
  if (mine) {
    // Company-wide settings — including compliance disclosure text, ticker, and quiet
    // mode — are admin-only. RLS scopes to the company but doesn't gate by role, so a
    // non-admin member could otherwise rewrite the disclosure language. Block them.
    const role = await getMyRole();
    if (role !== "admin") {
      return NextResponse.json({ error: "Only company admins can change these settings." }, { status: 403 });
    }
    const updated = await updateMyCompany(patch);
    return NextResponse.json(updated ?? mine.company);
  }

  // Local single-company fallback (no auth) — keeps the demo running.
  const db = getDb();
  const before = db.company.quietMode;
  db.company = { ...db.company, ...patch };

  if (patch.quietMode !== undefined && patch.quietMode !== before) {
    logAudit(
      db,
      `${db.company.approverName} (${db.company.approverTitle})`,
      patch.quietMode ? "QUIET_MODE_ON" : "QUIET_MODE_OFF",
      patch.quietMode
        ? "All publishing suspended (pre-earnings/offering quiet period)."
        : "Publishing re-enabled."
    );
  } else {
    logAudit(db, `${db.company.approverName} (${db.company.approverTitle})`, "SETTINGS_UPDATED", `Updated: ${Object.keys(patch).join(", ")}`);
  }
  saveDb(db);
  return NextResponse.json(db.company);
}

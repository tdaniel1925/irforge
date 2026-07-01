import { NextResponse } from "next/server";
import { resetDb } from "@/lib/db";
import { isSuperAdmin } from "@/lib/platform";

export const dynamic = "force-dynamic";

// Destructive: wipes and re-seeds the LOCAL demo JSON store. Was completely
// unauthenticated — anyone could POST and delete all demo drafts/audit/filings.
// Now super-admin only (and demo mode without auth configured still works locally).
export async function POST() {
  if (process.env.AUTH_ENABLED === "1" && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  resetDb();
  return NextResponse.json({ ok: true });
}

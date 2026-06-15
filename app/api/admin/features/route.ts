import { NextResponse } from "next/server";
import { isSuperAdmin, getCurrentUser, listAllCompanies, setCompanyFeature, IROS_FEATURES, writeAudit, getAuditLog } from "@/lib/platform";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET — all companies with their feature flags + recent audit log (super admin only).
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const [companies, audit] = await Promise.all([listAllCompanies(), getAuditLog({ limit: 50 })]);
  return NextResponse.json({ companies, audit, features: IROS_FEATURES });
}

// POST { companyId, feature, enabled } — toggle one feature for one company (1 click).
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Super admin only" }, { status: 403 });
  const me = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  const companyId = String(body.companyId ?? "");
  const feature = String(body.feature ?? "");
  const enabled = Boolean(body.enabled);

  if (!companyId || !IROS_FEATURES.some((f) => f.key === feature)) {
    return NextResponse.json({ error: "Bad request" }, { status: 422 });
  }

  await setCompanyFeature(companyId, feature, enabled);
  await writeAudit({
    companyId,
    actorUserId: me?.id,
    actorEmail: me?.email,
    action: enabled ? "feature.enabled" : "feature.disabled",
    entityType: "feature",
    entityId: feature,
    payload: { feature, enabled },
  });
  return NextResponse.json({ ok: true });
}

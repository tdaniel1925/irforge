import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSuperAdmin, writeAudit, getCurrentUser } from "@/lib/platform";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE = "impersonate_company";

// POST { companyId } — super-admin starts acting as a company. Sets a cookie that
// getMyCompany() honors (only for super admins). DELETE — stop impersonating.
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const companyId = String(b.companyId ?? "");
  if (!companyId) return NextResponse.json({ error: "Missing companyId." }, { status: 422 });

  // Confirm the company exists (service role; bypasses RLS).
  const svc = createServiceClient();
  const { data: c } = await svc.from("companies").select("id, name, ticker").eq("id", companyId).maybeSingle();
  if (!c) return NextResponse.json({ error: "Company not found." }, { status: 404 });

  (await cookies()).set(COOKIE, companyId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
  const me = await getCurrentUser();
  await writeAudit({ companyId, actorEmail: me?.email, action: "admin.impersonate_start", entityType: "company", entityId: companyId, payload: { name: c.name, ticker: c.ticker } });
  return NextResponse.json({ ok: true, company: { id: c.id, name: c.name, ticker: c.ticker } });
}

export async function DELETE() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const jar = await cookies();
  const was = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  const me = await getCurrentUser();
  if (was) await writeAudit({ companyId: was, actorEmail: me?.email, action: "admin.impersonate_stop", entityType: "company", entityId: was });
  return NextResponse.json({ ok: true });
}

// GET — who (if anyone) is currently being impersonated.
export async function GET() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return NextResponse.json({ impersonating: null });
  const svc = createServiceClient();
  const { data: c } = await svc.from("companies").select("id, name, ticker").eq("id", id).maybeSingle();
  return NextResponse.json({ impersonating: c ?? null });
}

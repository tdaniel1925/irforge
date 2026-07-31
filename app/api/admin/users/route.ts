import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { listUsers, listLinkableCompanies, linkUserToCompany, unlinkUserFromCompany } from "@/lib/adminUsers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET ?search=  → users (classified by company). ?companies=1 → linkable company list.
export async function GET(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const url = new URL(req.url);
  if (url.searchParams.get("companies") === "1") {
    return NextResponse.json({ companies: await listLinkableCompanies() });
  }
  const search = url.searchParams.get("search") || undefined;
  return NextResponse.json(await listUsers({ search }));
}

// POST { action: "link"|"unlink", userId, companyId, role? }
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const userId = String(b.userId ?? "");
  const companyId = String(b.companyId ?? "");
  if (!userId || !companyId) return NextResponse.json({ error: "Missing userId or companyId." }, { status: 422 });

  if (b.action === "unlink") {
    const r = await unlinkUserFromCompany({ userId, companyId });
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
  }
  // default: link
  const role = b.role === "admin" ? "admin" : "member";
  const r = await linkUserToCompany({ userId, companyId, role });
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
}

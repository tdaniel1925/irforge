import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { listCustomers, getCustomerDetail, archiveCompany, deleteCompany } from "@/lib/adminCustomers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function guard() {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  return null;
}

// GET — overview list (?archived=1 to include archived) OR one detail (?id=…).
export async function GET(req: Request) {
  const g = await guard();
  if (g) return g;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const detail = await getCustomerDetail(id);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ customer: detail });
  }
  const customers = await listCustomers({ includeArchived: url.searchParams.get("archived") === "1" });
  return NextResponse.json({ customers });
}

// POST — { action: "archive"|"unarchive"|"delete", companyId, confirm? }
export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const companyId = String(b.companyId ?? "");
  if (!companyId) return NextResponse.json({ error: "Missing companyId." }, { status: 422 });

  if (b.action === "archive") {
    const r = await archiveCompany(companyId, true);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
  }
  if (b.action === "unarchive") {
    const r = await archiveCompany(companyId, false);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
  }
  if (b.action === "delete") {
    // Require the typed company name as a safety confirmation.
    const detail = await getCustomerDetail(companyId);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const expected = (detail.name || detail.ticker || "").trim();
    if (String(b.confirm ?? "").trim() !== expected) {
      return NextResponse.json({ error: `Type the company name (“${expected}”) to confirm deletion.` }, { status: 422 });
    }
    const r = await deleteCompany(companyId);
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 422 });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 422 });
}

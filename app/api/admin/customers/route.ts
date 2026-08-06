import { NextResponse } from "next/server";
import { isSuperAdmin } from "@/lib/platform";
import { listCustomers, getCustomerDetail, archiveCompany, deleteCompany, setCompanySuspended } from "@/lib/adminCustomers";

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
  const kindParam = url.searchParams.get("kind");
  const kind = (["customer", "prospect", "phantom", "all"].includes(kindParam ?? "") ? kindParam : undefined) as "customer" | "prospect" | "phantom" | "all" | undefined;
  const customers = await listCustomers({ includeArchived: url.searchParams.get("archived") === "1", kind });
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
  if (b.action === "suspend" || b.action === "unsuspend") {
    const r = await setCompanySuspended(companyId, b.action === "suspend", String(b.reason ?? ""));
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

// POST to /api/admin/customers/bulk isn't a thing (single route file); bulk is a
// separate PATCH here to keep the verb distinct from single-item POST actions.
// Body: { action: "archive"|"unarchive"|"delete", ids: string[], confirm?: string }
export async function PATCH(req: Request) {
  const g = await guard();
  if (g) return g;
  const b = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(b.ids) ? b.ids.map(String).slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: "No customers selected." }, { status: 422 });

  // Bulk delete is guarded by a count-based typed confirmation (typing each
  // company name for a batch is impractical): the client must send confirm === "delete N".
  if (b.action === "delete" && String(b.confirm ?? "").trim().toLowerCase() !== `delete ${ids.length}`) {
    return NextResponse.json({ error: `Type “delete ${ids.length}” to confirm deleting ${ids.length} customers.` }, { status: 422 });
  }

  let succeeded = 0;
  const failed: { id: string; error: string }[] = [];
  for (const id of ids) {
    let r: { ok: boolean; error?: string };
    if (b.action === "archive") r = await archiveCompany(id, true);
    else if (b.action === "unarchive") r = await archiveCompany(id, false);
    else if (b.action === "delete") r = await deleteCompany(id);
    else return NextResponse.json({ error: "Unknown bulk action." }, { status: 422 });
    if (r.ok) succeeded++; else failed.push({ id, error: r.error ?? "failed" });
  }
  return NextResponse.json({ ok: succeeded, failed });
}

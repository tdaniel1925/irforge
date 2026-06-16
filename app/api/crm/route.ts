import { NextResponse } from "next/server";
import { getMyCompany } from "@/lib/supabase/store";
import {
  listContacts, upsertContact, deleteContact,
  listCompanies, upsertCompany, deleteCompany,
  listDeals, upsertDeal, moveDeal, deleteDeal,
  listActivities, addActivity,
  listTasks, upsertTask, deleteTask,
} from "@/lib/crm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// One endpoint for the whole CRM. GET ?entity=all|contacts|companies|deals|tasks|activities
// POST { entity, action: 'save'|'delete'|'move'|'log', ...payload }.
export async function GET(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const entity = new URL(req.url).searchParams.get("entity") ?? "all";
  const contactId = new URL(req.url).searchParams.get("contactId") ?? undefined;
  const dealId = new URL(req.url).searchParams.get("dealId") ?? undefined;

  if (entity === "contacts") return NextResponse.json({ contacts: await listContacts() });
  if (entity === "companies") return NextResponse.json({ companies: await listCompanies() });
  if (entity === "deals") return NextResponse.json({ deals: await listDeals() });
  if (entity === "tasks") return NextResponse.json({ tasks: await listTasks() });
  if (entity === "activities") return NextResponse.json({ activities: await listActivities({ contactId, dealId }) });

  const [contacts, companies, deals, tasks] = await Promise.all([listContacts(), listCompanies(), listDeals(), listTasks()]);
  return NextResponse.json({ contacts, companies, deals, tasks });
}

export async function POST(req: Request) {
  const mine = await getMyCompany();
  if (!mine) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const { entity, action } = b;

  try {
    if (entity === "contact") {
      if (action === "delete") { await deleteContact(b.id); return NextResponse.json({ ok: true }); }
      const c = await upsertContact(b.data ?? {}); return NextResponse.json({ ok: true, contact: c });
    }
    if (entity === "company") {
      if (action === "delete") { await deleteCompany(b.id); return NextResponse.json({ ok: true }); }
      const c = await upsertCompany(b.data ?? {}); return NextResponse.json({ ok: true, company: c });
    }
    if (entity === "deal") {
      if (action === "delete") { await deleteDeal(b.id); return NextResponse.json({ ok: true }); }
      if (action === "move") { await moveDeal(b.id, b.stage); return NextResponse.json({ ok: true }); }
      const d = await upsertDeal(b.data ?? {}); return NextResponse.json({ ok: true, deal: d });
    }
    if (entity === "task") {
      if (action === "delete") { await deleteTask(b.id); return NextResponse.json({ ok: true }); }
      const tk = await upsertTask(b.data ?? {}); return NextResponse.json({ ok: true, task: tk });
    }
    if (entity === "activity") {
      const a = await addActivity(b.data ?? {}); return NextResponse.json({ ok: true, activity: a });
    }
  } catch (e) {
    console.error("[crm] action failed:", e);
    return NextResponse.json({ error: "Action failed." }, { status: 500 });
  }
  return NextResponse.json({ error: "Unknown entity/action." }, { status: 422 });
}

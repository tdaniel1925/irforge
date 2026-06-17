import { createServerSupabase } from "./supabase/server";
import { getMyCompany } from "./supabase/store";
import { writeAudit } from "./platform";

// Unified CRM data layer (contacts ↔ companies ↔ deals, activities, tasks).
// Everything RLS-scoped to the caller's tenant company. Supabase only.

async function tenant(): Promise<{ cid: string; email: string; uid: string } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const mine = await getMyCompany();
  if (!mine || !user) return null;
  return { cid: mine.id, email: user.email ?? "", uid: user.id };
}

// ── Types ──
export interface CrmContact {
  id: string; crmCompanyId: string | null; fullName: string; title: string; email: string; phone: string;
  category: string; stage: string; linkedinUrl: string; xHandle: string; topics: string[]; aum: string;
  peersHeld: string[]; notes: string; ownerEmail: string; lastTouchAt: string | null; nextFollowup: string | null;
}
export interface CrmCompany { id: string; name: string; domain: string; type: string; industry: string; city: string; state: string; website: string; notes: string; ownerEmail: string }
export interface CrmDeal { id: string; title: string; stage: string; value: number; currency: string; contactId: string | null; crmCompanyId: string | null; closeDate: string | null; status: string; notes: string; ownerEmail: string }
export interface CrmActivity { id: string; contactId: string | null; crmCompanyId: string | null; dealId: string | null; kind: string; direction: string; summary: string; body: string; aiReply: string; occurredAt: string; actorEmail: string }
export interface CrmTask { id: string; title: string; dueDate: string | null; done: boolean; contactId: string | null; dealId: string | null; ownerEmail: string }

// ── mappers ──
const contact = (r: Record<string, unknown>): CrmContact => ({
  id: String(r.id), crmCompanyId: r.crm_company_id ? String(r.crm_company_id) : null,
  fullName: (r.full_name as string) ?? "", title: (r.title as string) ?? "", email: (r.email as string) ?? "",
  phone: (r.phone as string) ?? "", category: (r.category as string) ?? "investor", stage: (r.stage as string) ?? "new",
  linkedinUrl: (r.linkedin_url as string) ?? "", xHandle: (r.x_handle as string) ?? "", topics: (r.topics as string[]) ?? [],
  aum: (r.aum as string) ?? "", peersHeld: (r.peers_held as string[]) ?? [], notes: (r.notes as string) ?? "",
  ownerEmail: (r.owner_email as string) ?? "", lastTouchAt: r.last_touch_at ? String(r.last_touch_at) : null,
  nextFollowup: r.next_followup ? String(r.next_followup) : null,
});
const comp = (r: Record<string, unknown>): CrmCompany => ({
  id: String(r.id), name: (r.name as string) ?? "", domain: (r.domain as string) ?? "", type: (r.type as string) ?? "other",
  industry: (r.industry as string) ?? "", city: (r.city as string) ?? "", state: (r.state as string) ?? "",
  website: (r.website as string) ?? "", notes: (r.notes as string) ?? "", ownerEmail: (r.owner_email as string) ?? "",
});
const deal = (r: Record<string, unknown>): CrmDeal => ({
  id: String(r.id), title: (r.title as string) ?? "", stage: (r.stage as string) ?? "lead", value: Number(r.value ?? 0),
  currency: (r.currency as string) ?? "USD", contactId: r.contact_id ? String(r.contact_id) : null,
  crmCompanyId: r.crm_company_id ? String(r.crm_company_id) : null, closeDate: r.close_date ? String(r.close_date) : null,
  status: (r.status as string) ?? "open", notes: (r.notes as string) ?? "", ownerEmail: (r.owner_email as string) ?? "",
});
const activity = (r: Record<string, unknown>): CrmActivity => ({
  id: String(r.id), contactId: r.contact_id ? String(r.contact_id) : null, crmCompanyId: r.crm_company_id ? String(r.crm_company_id) : null,
  dealId: r.deal_id ? String(r.deal_id) : null, kind: (r.kind as string) ?? "note", direction: (r.direction as string) ?? "outbound",
  summary: (r.summary as string) ?? "", body: (r.body as string) ?? "", aiReply: (r.ai_reply as string) ?? "",
  occurredAt: String(r.occurred_at ?? ""), actorEmail: (r.actor_email as string) ?? "",
});
const task = (r: Record<string, unknown>): CrmTask => ({
  id: String(r.id), title: (r.title as string) ?? "", dueDate: r.due_date ? String(r.due_date) : null,
  done: Boolean(r.done), contactId: r.contact_id ? String(r.contact_id) : null, dealId: r.deal_id ? String(r.deal_id) : null,
  ownerEmail: (r.owner_email as string) ?? "",
});

// ── Contacts ──
export async function listContacts(): Promise<CrmContact[]> {
  const t = await tenant(); if (!t) return [];
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_contacts").select("*").eq("company_id", t.cid).order("updated_at", { ascending: false }).limit(5000);
  return (data ?? []).map(contact);
}
export async function getContact(id: string): Promise<CrmContact | null> {
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_contacts").select("*").eq("id", id).maybeSingle();
  return data ? contact(data) : null;
}
export async function upsertContact(input: Partial<CrmContact> & { id?: string }): Promise<CrmContact | null> {
  const t = await tenant(); if (!t) return null;
  const sb = await createServerSupabase();
  const row: Record<string, unknown> = {
    company_id: t.cid, crm_company_id: input.crmCompanyId ?? null, full_name: input.fullName ?? "", title: input.title ?? "",
    email: input.email ?? "", phone: input.phone ?? "", category: input.category ?? "investor", stage: input.stage ?? "new",
    linkedin_url: input.linkedinUrl ?? "", x_handle: input.xHandle ?? "", topics: input.topics ?? [], aum: input.aum ?? "",
    peers_held: input.peersHeld ?? [], notes: input.notes ?? "",
    next_followup: input.nextFollowup ?? null, updated_at: new Date().toISOString(),
  };
  // Stamp the creator as owner on NEW records; preserve the existing owner on edit
  // unless explicitly reassigned.
  if (input.id) { if (input.ownerEmail !== undefined) row.owner_email = input.ownerEmail; }
  else row.owner_email = input.ownerEmail || t.email;
  let data;
  if (input.id) ({ data } = await sb.from("crm_contacts").update(row).eq("id", input.id).select("*").single());
  else ({ data } = await sb.from("crm_contacts").insert(row).select("*").single());
  if (data) await writeAudit({ companyId: t.cid, actorEmail: t.email, action: input.id ? "crm.contact_updated" : "crm.contact_created", entityType: "crm_contact", entityId: String(data.id) });
  return data ? contact(data) : null;
}
export async function deleteContact(id: string): Promise<void> {
  const sb = await createServerSupabase();
  await sb.from("crm_contacts").delete().eq("id", id);
}

// ── Companies ──
export async function listCompanies(): Promise<CrmCompany[]> {
  const t = await tenant(); if (!t) return [];
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_companies").select("*").eq("company_id", t.cid).order("updated_at", { ascending: false }).limit(5000);
  return (data ?? []).map(comp);
}
export async function upsertCompany(input: Partial<CrmCompany> & { id?: string }): Promise<CrmCompany | null> {
  const t = await tenant(); if (!t) return null;
  const sb = await createServerSupabase();
  const row: Record<string, unknown> = {
    company_id: t.cid, name: input.name ?? "", domain: input.domain ?? "", type: input.type ?? "other",
    industry: input.industry ?? "", city: input.city ?? "", state: input.state ?? "", website: input.website ?? "",
    notes: input.notes ?? "", updated_at: new Date().toISOString(),
  };
  if (input.id) { if (input.ownerEmail !== undefined) row.owner_email = input.ownerEmail; }
  else row.owner_email = input.ownerEmail || t.email;
  let data;
  if (input.id) ({ data } = await sb.from("crm_companies").update(row).eq("id", input.id).select("*").single());
  else ({ data } = await sb.from("crm_companies").insert(row).select("*").single());
  return data ? comp(data) : null;
}
export async function deleteCompany(id: string): Promise<void> {
  const sb = await createServerSupabase();
  await sb.from("crm_companies").delete().eq("id", id);
}

// ── Deals ──
export async function listDeals(): Promise<CrmDeal[]> {
  const t = await tenant(); if (!t) return [];
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_deals").select("*").eq("company_id", t.cid).order("updated_at", { ascending: false }).limit(5000);
  return (data ?? []).map(deal);
}
export async function upsertDeal(input: Partial<CrmDeal> & { id?: string }): Promise<CrmDeal | null> {
  const t = await tenant(); if (!t) return null;
  const sb = await createServerSupabase();
  const status = input.stage === "won" ? "won" : input.stage === "lost" ? "lost" : (input.status ?? "open");
  const row: Record<string, unknown> = {
    company_id: t.cid, title: input.title ?? "", stage: input.stage ?? "lead", value: input.value ?? 0,
    currency: input.currency ?? "USD", contact_id: input.contactId ?? null, crm_company_id: input.crmCompanyId ?? null,
    close_date: input.closeDate ?? null, status, notes: input.notes ?? "",
    updated_at: new Date().toISOString(),
  };
  if (input.id) { if (input.ownerEmail !== undefined) row.owner_email = input.ownerEmail; }
  else row.owner_email = input.ownerEmail || t.email;
  let data;
  if (input.id) ({ data } = await sb.from("crm_deals").update(row).eq("id", input.id).select("*").single());
  else ({ data } = await sb.from("crm_deals").insert(row).select("*").single());
  if (data) await writeAudit({ companyId: t.cid, actorEmail: t.email, action: input.id ? "crm.deal_updated" : "crm.deal_created", entityType: "crm_deal", entityId: String(data.id), payload: { stage: input.stage } });
  return data ? deal(data) : null;
}
export async function moveDeal(id: string, stage: string): Promise<void> {
  const t = await tenant(); if (!t) return;
  const sb = await createServerSupabase();
  const status = stage === "won" ? "won" : stage === "lost" ? "lost" : "open";
  await sb.from("crm_deals").update({ stage, status, updated_at: new Date().toISOString() }).eq("id", id);
  await writeAudit({ companyId: t.cid, actorEmail: t.email, action: "crm.deal_moved", entityType: "crm_deal", entityId: id, payload: { stage } });
}
export async function deleteDeal(id: string): Promise<void> {
  const sb = await createServerSupabase();
  await sb.from("crm_deals").delete().eq("id", id);
}

// ── Activities ──
export async function listActivities(filter?: { contactId?: string; dealId?: string }): Promise<CrmActivity[]> {
  const t = await tenant(); if (!t) return [];
  const sb = await createServerSupabase();
  let q = sb.from("crm_activities").select("*").eq("company_id", t.cid).order("occurred_at", { ascending: false }).limit(1000);
  if (filter?.contactId) q = q.eq("contact_id", filter.contactId);
  if (filter?.dealId) q = q.eq("deal_id", filter.dealId);
  const { data } = await q;
  return (data ?? []).map(activity);
}
export async function addActivity(input: Partial<CrmActivity>): Promise<CrmActivity | null> {
  const t = await tenant(); if (!t) return null;
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_activities").insert({
    company_id: t.cid, contact_id: input.contactId ?? null, crm_company_id: input.crmCompanyId ?? null, deal_id: input.dealId ?? null,
    kind: input.kind ?? "note", direction: input.direction ?? "outbound", summary: input.summary ?? "", body: input.body ?? "",
    ai_reply: input.aiReply ?? "", actor_email: t.email, occurred_at: input.occurredAt ?? new Date().toISOString(),
  }).select("*").single();
  // bump contact last_touch
  if (data && input.contactId) await sb.from("crm_contacts").update({ last_touch_at: new Date().toISOString() }).eq("id", input.contactId);
  return data ? activity(data) : null;
}

// ── Tasks ──
export async function listTasks(): Promise<CrmTask[]> {
  const t = await tenant(); if (!t) return [];
  const sb = await createServerSupabase();
  const { data } = await sb.from("crm_tasks").select("*").eq("company_id", t.cid).order("due_date", { ascending: true, nullsFirst: false }).limit(2000);
  return (data ?? []).map(task);
}
export async function upsertTask(input: Partial<CrmTask> & { id?: string }): Promise<CrmTask | null> {
  const t = await tenant(); if (!t) return null;
  const sb = await createServerSupabase();
  const row: Record<string, unknown> = {
    company_id: t.cid, title: input.title ?? "", due_date: input.dueDate ?? null, done: input.done ?? false,
    contact_id: input.contactId ?? null, deal_id: input.dealId ?? null, owner_email: input.ownerEmail ?? t.email,
  };
  let data;
  if (input.id) ({ data } = await sb.from("crm_tasks").update(row).eq("id", input.id).select("*").single());
  else ({ data } = await sb.from("crm_tasks").insert(row).select("*").single());
  return data ? task(data) : null;
}
export async function deleteTask(id: string): Promise<void> {
  const sb = await createServerSupabase();
  await sb.from("crm_tasks").delete().eq("id", id);
}

// ── Dashboard metrics ──
export async function crmMetrics() {
  const [contacts, deals, tasks, activities] = await Promise.all([listContacts(), listDeals(), listTasks(), listActivities()]);
  const open = deals.filter((d) => d.status === "open");
  const pipelineValue = open.reduce((s, d) => s + (d.value || 0), 0);
  const won = deals.filter((d) => d.status === "won");
  const wonValue = won.reduce((s, d) => s + (d.value || 0), 0);
  const weekAgo = Date.now() - 7 * 86400e3;
  const today = new Date().toISOString().slice(0, 10);
  return {
    contacts: contacts.length,
    openDeals: open.length,
    pipelineValue,
    wonValue,
    wonCount: won.length,
    lostCount: deals.filter((d) => d.status === "lost").length,
    activities7d: activities.filter((a) => new Date(a.occurredAt).getTime() >= weekAgo).length,
    tasksDue: tasks.filter((tk) => !tk.done && tk.dueDate && tk.dueDate <= today).length,
    dealsByStage: deals.reduce<Record<string, { count: number; value: number }>>((m, d) => {
      (m[d.stage] ??= { count: 0, value: 0 }); m[d.stage].count++; m[d.stage].value += d.value || 0; return m;
    }, {}),
  };
}

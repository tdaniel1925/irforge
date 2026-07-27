import { createServiceClient } from "../supabase/server";
import { writeAudit } from "../platform";
import { ServiceError, requireScope, type ActorContext } from "./context";

// ── CRM service (gateway surface): reads + append-only writes ──
// Deliberately narrower than lib/crm.ts: an integration can list contacts and
// tasks, add a timestamped note, and create a task. No updates, no deletes, no
// deals — those stay human-driven in the UI for now.

export interface GatewayContact {
  id: string; fullName: string; title: string; email: string; companyName: string;
  category: string; optedIn: boolean; lastTouchAt: string | null; nextFollowup: string | null;
}
export interface GatewayTask {
  id: string; title: string; dueDate: string | null; done: boolean; contactId: string | null; ownerEmail: string;
}

export async function listContacts(ctx: ActorContext, opts?: { search?: string; limit?: number }): Promise<GatewayContact[]> {
  requireScope(ctx, "crm:read");
  const svc = createServiceClient();
  let q = svc.from("crm_contacts")
    .select("id, full_name, title, email, company_name, category, opted_in, last_touch_at, next_followup")
    .eq("company_id", ctx.companyId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(opts?.limit ?? 200, 1000));
  if (opts?.search) q = q.ilike("full_name", `%${opts.search.slice(0, 100)}%`);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: String(r.id), fullName: (r.full_name as string) ?? "", title: (r.title as string) ?? "",
    email: (r.email as string) ?? "", companyName: (r.company_name as string) ?? "",
    category: (r.category as string) ?? "investor", optedIn: Boolean(r.opted_in),
    lastTouchAt: r.last_touch_at ? String(r.last_touch_at) : null,
    nextFollowup: r.next_followup ? String(r.next_followup) : null,
  }));
}

export async function listTasks(ctx: ActorContext, opts?: { openOnly?: boolean; limit?: number }): Promise<GatewayTask[]> {
  requireScope(ctx, "crm:read");
  const svc = createServiceClient();
  let q = svc.from("crm_tasks")
    .select("id, title, due_date, done, contact_id, owner_email")
    .eq("company_id", ctx.companyId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(Math.min(opts?.limit ?? 200, 1000));
  if (opts?.openOnly !== false) q = q.eq("done", false);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: String(r.id), title: (r.title as string) ?? "", dueDate: r.due_date ? String(r.due_date) : null,
    done: Boolean(r.done), contactId: r.contact_id ? String(r.contact_id) : null,
    ownerEmail: (r.owner_email as string) ?? "",
  }));
}

// Append-only, timestamped note on a contact (the same crm_activities timeline
// the UI's Note history shows). Bumps the contact's last-touch.
export async function createContactNote(ctx: ActorContext, input: { contactId: string; body: string }): Promise<{ id: string }> {
  requireScope(ctx, "crm:write");
  const body = (input.body ?? "").trim().slice(0, 4000);
  if (!body) throw new ServiceError("invalid", "Note body is required.");
  const svc = createServiceClient();
  // Company-scoped existence check — a foreign contact id is a not_found.
  const { data: contact } = await svc.from("crm_contacts").select("id").eq("id", input.contactId).eq("company_id", ctx.companyId).maybeSingle();
  if (!contact) throw new ServiceError("not_found", "Contact not found.");

  const { data, error } = await svc.from("crm_activities").insert({
    company_id: ctx.companyId, contact_id: input.contactId, kind: "note",
    direction: "outbound", summary: "", body, actor_email: ctx.actorEmail,
    occurred_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) throw new ServiceError("invalid", error?.message ?? "Couldn't save the note.");
  await svc.from("crm_contacts").update({ last_touch_at: new Date().toISOString() }).eq("id", input.contactId).eq("company_id", ctx.companyId);
  await writeAudit({
    companyId: ctx.companyId, actorEmail: ctx.actorEmail, action: "crm.note_created",
    entityType: "crm_contact", entityId: input.contactId,
    payload: { requestId: ctx.requestId, authMethod: ctx.authMethod },
  });
  return { id: String(data.id) };
}

export async function createTask(ctx: ActorContext, input: { title: string; dueDate?: string | null; contactId?: string | null }): Promise<{ id: string }> {
  requireScope(ctx, "crm:write");
  const title = (input.title ?? "").trim().slice(0, 300);
  if (!title) throw new ServiceError("invalid", "Task title is required.");
  const svc = createServiceClient();
  if (input.contactId) {
    const { data: contact } = await svc.from("crm_contacts").select("id").eq("id", input.contactId).eq("company_id", ctx.companyId).maybeSingle();
    if (!contact) throw new ServiceError("not_found", "Contact not found.");
  }
  const { data, error } = await svc.from("crm_tasks").insert({
    company_id: ctx.companyId, title, due_date: input.dueDate ?? null, done: false,
    contact_id: input.contactId ?? null, owner_email: ctx.actorEmail,
  }).select("id").single();
  if (error || !data) throw new ServiceError("invalid", error?.message ?? "Couldn't create the task.");
  await writeAudit({
    companyId: ctx.companyId, actorEmail: ctx.actorEmail, action: "crm.task_created",
    entityType: "crm_task", entityId: String(data.id),
    payload: { requestId: ctx.requestId, authMethod: ctx.authMethod },
  });
  return { id: String(data.id) };
}

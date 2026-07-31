import { createServiceClient } from "./supabase/server";
import { writeAudit } from "./platform";

// Admin data layer for investor-account management (the /admin/investors console).
// SERVICE-ROLE — every function here is called only from routes already gated by
// isSuperAdmin(). Reads join auth emails; writes are audited. Never used by
// non-admin paths.

export interface InvestorRow {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  email: string;
  bio: string;
  plan: string;
  subscriptionStatus: string;
  profileComplete: boolean;
  suspended: boolean;
  suspendedReason: string;
  createdAt: string;
}

export interface InvestorDetail extends InvestorRow {
  posts: { id: string; ticker: string; body: string; flag: string; ts: string }[];
  watches: { ticker: string; ts: string }[];
  questionCount: number;
}

function rowToInvestor(r: Record<string, unknown>, email: string): InvestorRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    handle: String(r.handle ?? ""),
    displayName: String(r.display_name ?? ""),
    email,
    bio: String(r.bio ?? ""),
    plan: String(r.plan ?? "free"),
    subscriptionStatus: String(r.subscription_status ?? "none"),
    profileComplete: Boolean(r.profile_complete),
    suspended: !!r.suspended_at,
    suspendedReason: String(r.suspended_reason ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}

// Build a user_id → email map from Supabase auth (admins already see emails).
async function emailMap(svc: ReturnType<typeof createServiceClient>): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  try {
    const { data } = await svc.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) m.set(u.id, u.email ?? "");
  } catch { /* emails blank, rows still render */ }
  return m;
}

export interface ListOpts { search?: string; plan?: string; status?: "all" | "active" | "suspended"; limit?: number; offset?: number }

export async function listInvestors(opts: ListOpts = {}): Promise<{ rows: InvestorRow[]; total: number }> {
  const svc = createServiceClient();
  const limit = Math.min(opts.limit ?? 50, 200);
  const offset = Math.max(opts.offset ?? 0, 0);

  let q = svc.from("members").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (opts.plan && opts.plan !== "all") q = q.eq("plan", opts.plan);
  if (opts.status === "suspended") q = q.not("suspended_at", "is", null);
  if (opts.status === "active") q = q.is("suspended_at", null);
  // Handle/display_name search (email search handled client-side after join).
  if (opts.search) q = q.or(`handle.ilike.%${opts.search}%,display_name.ilike.%${opts.search}%`);
  q = q.range(offset, offset + limit - 1);

  const { data, count } = await q;
  const emails = await emailMap(svc);
  let rows = (data ?? []).map((r) => rowToInvestor(r, emails.get(String(r.user_id)) ?? ""));
  // If searching, also match on email (post-join) so email lookups work.
  if (opts.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter((r) => r.handle.toLowerCase().includes(s) || r.displayName.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }
  return { rows, total: count ?? rows.length };
}

export async function getInvestor(id: string): Promise<InvestorDetail | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("members").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const emails = await emailMap(svc);
  const base = rowToInvestor(data, emails.get(String(data.user_id)) ?? "");

  const { data: posts } = await svc.from("public_board").select("id, ticker, body, flag, created_at, parent_id").eq("member_id", id).order("created_at", { ascending: false }).limit(50);
  const { data: watches } = await svc.from("watches").select("ticker, created_at").eq("member_id", id).order("created_at", { ascending: false });
  const questionCount = (posts ?? []).filter((p) => p.flag === "question" && !p.parent_id).length;

  return {
    ...base,
    posts: (posts ?? []).map((p) => ({ id: String(p.id), ticker: String(p.ticker).toUpperCase(), body: String(p.body ?? ""), flag: String(p.flag ?? "chatter"), ts: String(p.created_at ?? "") })),
    watches: (watches ?? []).map((w) => ({ ticker: String(w.ticker).toUpperCase(), ts: String(w.created_at ?? "") })),
    questionCount,
  };
}

// ── Mutations (audited) ──

export async function setSuspended(id: string, suspended: boolean, actorEmail: string, reason = ""): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc.from("members")
    .update({ suspended_at: suspended ? new Date().toISOString() : null, suspended_reason: suspended ? reason.slice(0, 300) : "" })
    .eq("id", id).select("id, handle");
  const ok = (data?.length ?? 0) > 0;
  if (ok) await writeAudit({ companyId: null, actorEmail, action: suspended ? "investor.suspended" : "investor.unsuspended", entityType: "member", entityId: id, payload: { reason } });
  return ok;
}

export async function setInvestorPlan(id: string, plan: "free" | "member_plus", actorEmail: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc.from("members").update({ plan }).eq("id", id).select("id");
  const ok = (data?.length ?? 0) > 0;
  if (ok) await writeAudit({ companyId: null, actorEmail, action: "investor.plan_changed", entityType: "member", entityId: id, payload: { plan } });
  return ok;
}

// Hard delete: removes the member row (board posts / watches cascade via FK on
// member_id where configured; otherwise they're orphaned but harmless). The auth
// user is left intact — deleting the login is a separate Supabase-auth concern.
export async function deleteInvestor(id: string, actorEmail: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data: existing } = await svc.from("members").select("handle, user_id").eq("id", id).maybeSingle();
  if (!existing) return false;
  await svc.from("members").delete().eq("id", id);
  await writeAudit({ companyId: null, actorEmail, action: "investor.deleted", entityType: "member", entityId: id, payload: { handle: existing.handle } });
  return true;
}

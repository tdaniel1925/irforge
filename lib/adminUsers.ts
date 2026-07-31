import { createServiceClient } from "./supabase/server";
import { isSuperAdmin, writeAudit, getCurrentUser } from "./platform";

// Admin Users data layer — EVERY human on the platform, classified by the account
// they belong to. This is the counterpart to the Customers list: customers are
// COMPANIES, users are PEOPLE. A company-side user is grouped under their company
// (fd@, bn@, jd@ → American Fusion); an investor is its own kind.
//
// Service-role; every entry point re-checks isSuperAdmin().

export type UserKind = "company_member" | "investor" | "unlinked";

export interface AdminUser {
  userId: string;
  email: string;
  kind: UserKind;
  // Company membership (company_member)
  companyId: string | null;
  companyName: string | null;
  companyTicker: string | null;
  role: string | null;          // admin | member (company) — investor has none
  membershipStatus: string | null; // active | invited
  // Investor (investor)
  handle: string | null;
  createdAt: string;
}

export interface UsersResult {
  users: AdminUser[];
  // Company-side users grouped by company, for the grouped view.
  byCompany: { companyId: string; companyName: string; companyTicker: string; count: number; users: AdminUser[] }[];
  counts: { total: number; companyMembers: number; investors: number; unlinked: number };
}

export async function listUsers(opts: { search?: string } = {}): Promise<UsersResult> {
  if (!(await isSuperAdmin())) return { users: [], byCompany: [], counts: { total: 0, companyMembers: 0, investors: 0, unlinked: 0 } };
  const svc = createServiceClient();

  // 1) All auth users (email + created_at + id).
  const authUsers: { id: string; email: string; createdAt: string }[] = [];
  try {
    let page = 1;
    for (;;) {
      const { data } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
      const batch = data?.users ?? [];
      for (const u of batch) authUsers.push({ id: u.id, email: u.email ?? "", createdAt: u.created_at ?? "" });
      if (batch.length < 1000) break;
      page++;
      if (page > 20) break; // safety cap (20k users)
    }
  } catch { /* auth listing failed — return what we can */ }

  // 2) Company memberships (active + invited) joined to company identity.
  const { data: memberships } = await svc
    .from("company_users")
    .select("user_id, invited_email, role, status, company_id, companies(id, name, ticker)")
    .in("status", ["active", "invited"])
    .limit(5000);

  // 3) Investor members.
  const { data: members } = await svc.from("members").select("user_id, handle").limit(5000);
  const investorByUser = new Map<string, string>();
  for (const m of members ?? []) investorByUser.set(String(m.user_id), String(m.handle ?? ""));

  // Index memberships by user_id (active wins over invited if both exist).
  type Mem = { role: string; status: string; companyId: string; name: string; ticker: string };
  const memByUser = new Map<string, Mem>();
  const memByEmail = new Map<string, Mem>();
  for (const cu of memberships ?? []) {
    const co = (cu as { companies?: { id?: string; name?: string; ticker?: string } }).companies;
    const mem: Mem = { role: String(cu.role ?? "member"), status: String(cu.status ?? ""), companyId: String(cu.company_id), name: String(co?.name ?? ""), ticker: String(co?.ticker ?? "") };
    if (cu.user_id) {
      const existing = memByUser.get(String(cu.user_id));
      if (!existing || (existing.status !== "active" && mem.status === "active")) memByUser.set(String(cu.user_id), mem);
    } else if (cu.invited_email) {
      memByEmail.set(String(cu.invited_email).toLowerCase(), mem);
    }
  }

  const users: AdminUser[] = authUsers.map((u) => {
    const mem = memByUser.get(u.id) ?? memByEmail.get(u.email.toLowerCase());
    const handle = investorByUser.get(u.id) ?? null;
    let kind: UserKind = "unlinked";
    if (mem) kind = "company_member";
    else if (handle) kind = "investor";
    return {
      userId: u.id, email: u.email, kind, createdAt: u.createdAt,
      companyId: mem?.companyId ?? null,
      companyName: mem?.name ?? null,
      companyTicker: mem?.ticker ?? null,
      role: mem?.role ?? null,
      membershipStatus: mem?.status ?? null,
      handle,
    };
  });

  // Invited-but-not-yet-signed-up teammates (no auth user yet) — surface them too.
  for (const [email, mem] of Array.from(memByEmail)) {
    if (!authUsers.some((u) => u.email.toLowerCase() === email)) {
      users.push({ userId: "", email, kind: "company_member", createdAt: "", companyId: mem.companyId, companyName: mem.name, companyTicker: mem.ticker, role: mem.role, membershipStatus: "invited", handle: null });
    }
  }

  const filtered = opts.search
    ? users.filter((u) => `${u.email} ${u.handle ?? ""} ${u.companyName ?? ""} ${u.companyTicker ?? ""}`.toLowerCase().includes(opts.search!.toLowerCase()))
    : users;

  // Group company members by company.
  const groups = new Map<string, { companyId: string; companyName: string; companyTicker: string; users: AdminUser[] }>();
  for (const u of filtered) {
    if (u.kind !== "company_member" || !u.companyId) continue;
    const g = groups.get(u.companyId) ?? { companyId: u.companyId, companyName: u.companyName || "(unnamed)", companyTicker: u.companyTicker || "", users: [] };
    g.users.push(u);
    groups.set(u.companyId, g);
  }
  const byCompany = Array.from(groups.values())
    .map((g) => ({ ...g, count: g.users.length }))
    .sort((a, b) => (b.companyTicker ? 1 : 0) - (a.companyTicker ? 1 : 0) || a.companyName.localeCompare(b.companyName));

  return {
    users: filtered,
    byCompany,
    counts: {
      total: filtered.length,
      companyMembers: filtered.filter((u) => u.kind === "company_member").length,
      investors: filtered.filter((u) => u.kind === "investor").length,
      unlinked: filtered.filter((u) => u.kind === "unlinked").length,
    },
  };
}

// ── Real companies for the "link to company" picker (customers + prospects,
// never phantoms — those have no name/ticker to pick). ──
export async function listLinkableCompanies(): Promise<{ id: string; name: string; ticker: string }[]> {
  if (!(await isSuperAdmin())) return [];
  const svc = createServiceClient();
  const { data } = await svc
    .from("companies")
    .select("id, name, ticker")
    .is("archived_at", null)
    .or("name.neq.,ticker.neq.")   // has a name OR a ticker (real, not phantom)
    .order("name", { ascending: true })
    .limit(1000);
  return (data ?? [])
    .filter((c) => (c.name && String(c.name).trim()) || (c.ticker && String(c.ticker).trim()))
    .map((c) => ({ id: String(c.id), name: String(c.name ?? "") || "(unnamed)", ticker: String(c.ticker ?? "") }));
}

// Link a user to a company as an active member/admin. Idempotent on
// (company_id, user_id). Also cleans up any empty phantom company the user owned,
// so linking fully resolves the "floating user" case.
export async function linkUserToCompany(input: { userId: string; companyId: string; role: "admin" | "member" }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Admin only." };
  const svc = createServiceClient();

  const { data: company } = await svc.from("companies").select("id, name").eq("id", input.companyId).maybeSingle();
  if (!company) return { ok: false, error: "Company not found." };
  const { data: user } = await svc.auth.admin.getUserById(input.userId);
  const email = user?.user?.email ?? "";

  const { error } = await svc.from("company_users").upsert(
    { company_id: input.companyId, user_id: input.userId, role: input.role, status: "active", invited_email: email },
    { onConflict: "company_id,user_id" }
  );
  if (error) return { ok: false, error: error.message };

  // Remove the user's empty phantom company, if any (they now belong somewhere real).
  await svc.from("companies").delete()
    .eq("owner_id", input.userId).eq("name", "").eq("ticker", "").is("archived_at", null);

  const me = await getCurrentUser();
  await writeAudit({ companyId: input.companyId, actorEmail: me?.email, action: "user.linked_to_company", entityType: "user", entityId: input.userId, payload: { role: input.role, email } });
  return { ok: true };
}

// Remove a user's membership from a company.
export async function unlinkUserFromCompany(input: { userId: string; companyId: string }): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Admin only." };
  const svc = createServiceClient();
  await svc.from("company_users").delete().eq("company_id", input.companyId).eq("user_id", input.userId);
  const me = await getCurrentUser();
  await writeAudit({ companyId: input.companyId, actorEmail: me?.email, action: "user.unlinked_from_company", entityType: "user", entityId: input.userId });
  return { ok: true };
}

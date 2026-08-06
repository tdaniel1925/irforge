import { createServiceClient } from "./supabase/server";
import { isSuperAdmin, IROS_FEATURES, getCompanyFeatures, writeAudit, getCurrentUser } from "./platform";
import { TIERS, type Tier } from "./billing";
import { classifyCompany, type CompanyKind } from "./customerClassify";

// Admin Customer-Management data layer. Service-role (bypasses RLS) — every entry
// point re-checks isSuperAdmin(). Surfaces billing, usage (from audit_log), team,
// and connections per company, plus archive/delete.

export interface CustomerRow {
  id: string;
  name: string;
  ticker: string;
  ownerEmail: string;
  tier: string;
  subscriptionStatus: string;
  comped: boolean;
  mrr: number;
  createdAt: string;
  archivedAt: string | null;
  postsTotal: number;
  lastActive: string | null;
  active30d: boolean;
  kind: CompanyKind;   // customer | prospect | phantom (see lib/customerClassify)
  onboardingComplete: boolean;
}

const PAID_ACTIONS = new Set([
  "post.created", "post.published", "social.post_drafted", "social.post_published",
  "social.calendar_generated", "approve", "summary.generated", "brief.generated",
]);

function mrrFor(tier: string, comped: boolean, status: string): number {
  if (comped || status !== "active") return 0;
  return TIERS[tier as Tier]?.price ?? 0;
}

async function emailFor(svc: ReturnType<typeof createServiceClient>, ownerId: string | null): Promise<string> {
  if (!ownerId) return "";
  try {
    const { data } = await svc.auth.admin.getUserById(ownerId);
    return data?.user?.email ?? "";
  } catch {
    return "";
  }
}

// Overview list: one row per company with billing + headline usage, each tagged
// with its kind. Defaults to CUSTOMERS ONLY (the money definition); pass a kind
// to get prospects or everything. This is what stops phantom team-member
// companies from showing up as customers.
export async function listCustomers(opts: { includeArchived?: boolean; kind?: CompanyKind | "all" } = {}): Promise<CustomerRow[]> {
  if (!(await isSuperAdmin())) return [];
  const svc = createServiceClient();
  const { data: cos } = await svc
    .from("companies")
    .select("id, name, ticker, owner_id, tier, subscription_status, stripe_subscription_id, onboarding_complete, created_at, archived_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const companies = (cos ?? []).filter((c) => opts.includeArchived || !c.archived_at);

  // Pull post counts + last-activity in two grouped queries instead of per-company.
  const ids = companies.map((c) => c.id);
  const postCounts: Record<string, number> = {};
  const lastActive: Record<string, string> = {};
  if (ids.length) {
    const { data: posts } = await svc.from("iros_posts").select("company_id").in("company_id", ids).limit(20000);
    for (const p of posts ?? []) postCounts[String(p.company_id)] = (postCounts[String(p.company_id)] ?? 0) + 1;
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const { data: acts } = await svc.from("audit_log").select("company_id, created_at").in("company_id", ids).gte("created_at", since).order("created_at", { ascending: false }).limit(20000);
    for (const a of acts ?? []) {
      const cid = String(a.company_id);
      if (!lastActive[cid]) lastActive[cid] = String(a.created_at); // first seen = newest (ordered desc)
    }
  }

  const rows: CustomerRow[] = [];
  for (const c of companies) {
    const comped = c.subscription_status === "active" && !c.stripe_subscription_id;
    const postsTotal = postCounts[String(c.id)] ?? 0;
    const kind = classifyCompany({
      name: c.name as string, ticker: c.ticker as string,
      onboardingComplete: Boolean(c.onboarding_complete),
      subscriptionStatus: (c.subscription_status as string) || "none",
      comped, postsTotal,
    });
    rows.push({
      id: String(c.id),
      name: (c.name as string) || "(unnamed)",
      ticker: (c.ticker as string) || "",
      ownerEmail: await emailFor(svc, (c.owner_id as string) || null),
      tier: (c.tier as string) || "free",
      subscriptionStatus: (c.subscription_status as string) || "none",
      comped,
      mrr: mrrFor((c.tier as string) || "free", comped, (c.subscription_status as string) || "none"),
      createdAt: String(c.created_at ?? ""),
      archivedAt: c.archived_at ? String(c.archived_at) : null,
      postsTotal,
      lastActive: lastActive[String(c.id)] ?? null,
      active30d: Boolean(lastActive[String(c.id)]),
      kind,
      onboardingComplete: Boolean(c.onboarding_complete),
    });
  }
  // Default: customers only (the money definition). "all" returns every kind;
  // an explicit kind filters to it. Phantoms are never returned unless kind==="all".
  const want = opts.kind ?? "customer";
  return want === "all" ? rows : rows.filter((r) => r.kind === want);
}

export interface CustomerDetail {
  id: string; name: string; ticker: string; ownerEmail: string; tier: string;
  subscriptionStatus: string; comped: boolean; mrr: number; createdAt: string; archivedAt: string | null; suspendedAt: string | null;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  team: { email: string; role: string; status: string }[];
  connectedSocials: string[];
  features: Record<string, boolean>;
  usage: { postsDrafted: number; postsPublished: number; postsScheduled: number; calendars: number; approvals: number; actions30d: number; lastActive: string | null };
  featureAdoption: string[]; // which tools they've actually touched
}

export async function getCustomerDetail(companyId: string): Promise<CustomerDetail | null> {
  if (!(await isSuperAdmin())) return null;
  const svc = createServiceClient();
  const { data: c } = await svc.from("companies").select("*").eq("id", companyId).maybeSingle();
  if (!c) return null;

  const comped = c.subscription_status === "active" && !c.stripe_subscription_id;

  // Team
  const { data: team } = await svc.from("company_users").select("user_id, invited_email, role, status").eq("company_id", companyId);
  const teamRows = await Promise.all((team ?? []).map(async (t) => ({
    email: (t.invited_email as string) || (await emailFor(svc, (t.user_id as string) || null)) || "—",
    role: (t.role as string) || "member",
    status: (t.status as string) || "active",
  })));

  // Connected socials (from Ayrshare profile, best-effort — skip live call here; we
  // only know whether a profile exists). Detailed networks are shown in Settings.
  const connectedSocials = c.ayrshare_profile_key ? ["(profile linked)"] : [];

  // Features enabled
  const features = await getCompanyFeatures(companyId);

  // Usage from audit_log (all-time counts + 30d activity).
  const { data: audit } = await svc.from("audit_log").select("action, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(10000);
  const rows = audit ?? [];
  const count = (a: string) => rows.filter((r) => r.action === a).length;
  const since = Date.now() - 30 * 864e5;
  const usage = {
    postsDrafted: count("social.post_drafted") + count("post.created") + count("social.post_created_manual"),
    postsPublished: count("social.post_published") + count("publish"),
    postsScheduled: count("social.post_scheduled"),
    calendars: count("social.calendar_generated"),
    approvals: count("approve") + count("bulk"),
    actions30d: rows.filter((r) => new Date(String(r.created_at)).getTime() >= since).length,
    lastActive: rows[0]?.created_at ? String(rows[0].created_at) : null,
  };
  // Feature adoption: distinct action prefixes that map to a tool.
  const touched = new Set<string>();
  for (const r of rows) {
    const a = String(r.action);
    if (a.startsWith("social.")) touched.add("Content Engine");
    else if (a.startsWith("crm.")) touched.add("CRM");
    else if (a === "approve" || a === "bulk" || a === "reject") touched.add("Approvals");
    else if (a.startsWith("voice")) touched.add("Executive Voices");
    else if (a.startsWith("quiet_period")) touched.add("Quiet Periods");
    else if (a === "summary.generated") touched.add("Intelligence");
    else if (a === "brief.generated") touched.add("Research Briefs");
    else if (a === "calendar" || a === "event") touched.add("Calendar");
  }

  return {
    id: String(c.id),
    name: (c.name as string) || "(unnamed)",
    ticker: (c.ticker as string) || "",
    ownerEmail: await emailFor(svc, (c.owner_id as string) || null),
    tier: (c.tier as string) || "free",
    subscriptionStatus: (c.subscription_status as string) || "none",
    comped,
    mrr: mrrFor((c.tier as string) || "free", comped, (c.subscription_status as string) || "none"),
    createdAt: String(c.created_at ?? ""),
    archivedAt: c.archived_at ? String(c.archived_at) : null,
    suspendedAt: c.suspended_at ? String(c.suspended_at) : null,
    stripeCustomerId: (c.stripe_customer_id as string) || null,
    stripeSubscriptionId: (c.stripe_subscription_id as string) || null,
    team: teamRows,
    connectedSocials,
    features,
    usage,
    featureAdoption: Array.from(touched),
  };
}

export async function archiveCompany(companyId: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Admin only." };
  const svc = createServiceClient();
  const { error } = await svc.from("companies").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  const me = await getCurrentUser();
  await writeAudit({ companyId, actorEmail: me?.email, action: archived ? "admin.company_archived" : "admin.company_unarchived", entityType: "company", entityId: companyId });
  return { ok: true };
}

// SUSPEND a company — a real freeze (distinct from archive). suspended_at != null
// locks the workspace (team sees a suspension screen), makes the public page
// "not available", and stops chats/posts/publishing. Reversible.
export async function setCompanySuspended(companyId: string, suspended: boolean, reason = ""): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Admin only." };
  const svc = createServiceClient();
  const { error } = await svc.from("companies")
    .update({ suspended_at: suspended ? new Date().toISOString() : null, suspended_reason: suspended ? reason.slice(0, 300) : "" })
    .eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  const me = await getCurrentUser();
  await writeAudit({ companyId, actorEmail: me?.email, action: suspended ? "admin.company_suspended" : "admin.company_unsuspended", entityType: "company", entityId: companyId, payload: { reason } });
  return { ok: true };
}

// Hard delete: removes the company; FK cascades clean up child rows. Irreversible.
export async function deleteCompany(companyId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: "Admin only." };
  const svc = createServiceClient();
  const { data: c } = await svc.from("companies").select("name, ticker").eq("id", companyId).maybeSingle();
  const me = await getCurrentUser();
  // Audit BEFORE delete (the company_id FK on audit_log is set null on delete).
  await writeAudit({ companyId, actorEmail: me?.email, action: "admin.company_deleted", entityType: "company", entityId: companyId, payload: { name: c?.name, ticker: c?.ticker } });
  const { error } = await svc.from("companies").delete().eq("id", companyId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export { IROS_FEATURES };

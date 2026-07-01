import { createServerSupabase, createServiceClient } from "./supabase/server";

// Platform layer: super-admin checks, per-company feature flags, append-only
// audit log. Generic / multi-tenant — used across the IR-OS feature suite.

// The full set of toggleable IR-OS features. Admins enable these per company.
export const IROS_FEATURES = [
  { key: "compliance", label: "Reg FD Classifier & Counsel Console", icon: "🛡️" },
  { key: "voices", label: "Executive Voice Profiles", icon: "🎙️" },
  { key: "calendar", label: "Editorial Calendar", icon: "🗓️" },
  { key: "social", label: "AI Social Content Engine", icon: "✨" },
  { key: "publishing", label: "Multi-channel Publishing", icon: "📣" },
  { key: "stakeholders", label: "Stakeholder Graph & Inbound", icon: "🤝" },
  { key: "intelligence", label: "Intelligence & Weekly Summary", icon: "📊" },
] as const;

export type FeatureKey = (typeof IROS_FEATURES)[number]["key"];

// ---------- super admin ----------
export async function isSuperAdmin(): Promise<boolean> {
  // Fail CLOSED on any error (auth or DB): a transient Supabase failure must deny
  // admin access cleanly, never throw and 500 the calling route.
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data, error } = await supabase
      .from("platform_admins")
      .select("super_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return false;
    return Boolean(data?.super_admin);
  } catch {
    return false;
  }
}

export async function getCurrentUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? "" };
}

// ---------- per-company feature flags ----------
// Returns a map { featureKey: enabled }. Missing = false (locked).
export async function getCompanyFeatures(companyId: string): Promise<Record<string, boolean>> {
  const svc = createServiceClient();
  const { data } = await svc.from("company_features").select("feature, enabled").eq("company_id", companyId);
  const map: Record<string, boolean> = {};
  for (const f of IROS_FEATURES) map[f.key] = false;
  for (const row of data ?? []) map[String(row.feature)] = Boolean(row.enabled);
  return map;
}

export async function setCompanyFeature(companyId: string, feature: string, enabled: boolean): Promise<void> {
  const svc = createServiceClient();
  await svc.from("company_features").upsert(
    { company_id: companyId, feature, enabled, updated_at: new Date().toISOString() },
    { onConflict: "company_id,feature" }
  );
}

// True when the company was given free full access (active subscription_status
// with no Stripe subscription behind it = comped/promo). Such companies unlock
// every feature, same as a paid customer would.
async function isCompedCompany(companyId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("companies")
    .select("subscription_status, stripe_subscription_id")
    .eq("id", companyId)
    .maybeSingle();
  return data?.subscription_status === "active" && !data?.stripe_subscription_id;
}

export async function companyHasFeature(companyId: string, feature: FeatureKey): Promise<boolean> {
  // Super admins always have every feature, regardless of per-company flags.
  if (await isSuperAdmin()) return true;
  // Comped/promo companies (free full access) get every feature too.
  if (await isCompedCompany(companyId)) return true;
  const features = await getCompanyFeatures(companyId);
  return Boolean(features[feature]);
}

// ---------- append-only audit log ----------
export async function writeAudit(entry: {
  companyId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const svc = createServiceClient();
    await svc.from("audit_log").insert({
      company_id: entry.companyId ?? null,
      actor_user_id: entry.actorUserId ?? null,
      actor_email: entry.actorEmail ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      payload: entry.payload ?? {},
    });
  } catch (e) {
    // Never let an audit write break the user action — but log it server-side.
    console.error("[audit] write failed:", e);
  }
}

export interface AuditRow {
  id: string;
  companyId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export async function getAuditLog(opts: { companyId?: string; limit?: number } = {}): Promise<AuditRow[]> {
  const svc = createServiceClient();
  let q = svc.from("audit_log").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 100);
  if (opts.companyId) q = q.eq("company_id", opts.companyId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    companyId: r.company_id ? String(r.company_id) : null,
    actorEmail: (r.actor_email as string) ?? null,
    action: String(r.action),
    entityType: r.entity_type ? String(r.entity_type) : null,
    entityId: r.entity_id ? String(r.entity_id) : null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    createdAt: String(r.created_at ?? ""),
  }));
}

// ---------- list companies (super-admin back-office) ----------
export interface AdminCompanyRow {
  id: string;
  name: string;
  ticker: string;
  tier: string;
  ownerEmail?: string;
  features: Record<string, boolean>;
}

export async function listAllCompanies(): Promise<AdminCompanyRow[]> {
  const svc = createServiceClient();
  const { data: companies } = await svc
    .from("companies")
    .select("id, name, ticker, tier, owner_id")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!companies) return [];

  // Pull all feature rows once, group by company.
  const { data: feats } = await svc.from("company_features").select("company_id, feature, enabled");
  const byCompany: Record<string, Record<string, boolean>> = {};
  for (const row of feats ?? []) {
    const cid = String(row.company_id);
    (byCompany[cid] ??= {})[String(row.feature)] = Boolean(row.enabled);
  }

  return companies.map((c) => {
    const features: Record<string, boolean> = {};
    for (const f of IROS_FEATURES) features[f.key] = byCompany[String(c.id)]?.[f.key] ?? false;
    return {
      id: String(c.id),
      name: (c.name as string) || "(unnamed)",
      ticker: (c.ticker as string) || "",
      tier: (c.tier as string) || "free",
      features,
    };
  });
}

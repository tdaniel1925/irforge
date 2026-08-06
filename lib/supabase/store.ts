import { createServerSupabase, createServiceClient } from "./server";
import type { Company } from "../types";

// Maps the snake_case companies row to the app's Company shape and back.
// Exported for the service layer (lib/services/*), which loads companies by
// explicit id under an ActorContext instead of from the session.
export function rowToCompany(r: Record<string, unknown>): Company {
  return {
    name: (r.name as string) ?? "",
    ticker: (r.ticker as string) ?? "",
    exchange: (r.exchange as string) ?? "",
    cik: (r.cik as string) ?? "",
    sector: (r.sector as string) ?? "",
    city: (r.city as string) ?? "",
    state: (r.state as string) ?? "",
    description: (r.description as string) ?? "",
    approverName: (r.approver_name as string) ?? "",
    approverTitle: (r.approver_title as string) ?? "",
    xHandle: (r.x_handle as string) ?? "",
    peers: (r.peers as string[]) ?? [],
    tier: ((r.tier as string) ?? "free") as Company["tier"],
    subscription_status: (r.subscription_status as string) ?? "none",
    // Comped/promo: active access with no Stripe subscription behind it (they were
    // given free access, not billed). Lets the UI hide pricing/checkout for them.
    comped: (r.subscription_status as string) === "active" && !r.stripe_subscription_id,
    suspended: !!r.suspended_at,
    quietMode: Boolean(r.quiet_mode),
    disclosureText: (r.disclosure_text as string) ?? "",
    flsText: (r.fls_text as string) ?? "",
    brandColors: (r.brand_colors as string) ?? "",
    logoUrl: (r.logo_url as string) ?? "",
    imageStyle: (r.image_style as string) ?? "",
    postGuidance: (r.post_guidance as string) ?? "",
    boardNotifyEmails: (r.board_notify_emails as string[]) ?? [],
    onboarded: Boolean(r.onboarding_complete),
    onboarding_complete: Boolean(r.onboarding_complete),
    // This company's Ayrshare user profile — the handle to their own linked socials.
    ayrshareProfileKey: (r.ayrshare_profile_key as string) || undefined,
    google_place_id: undefined,
    google_review_link: undefined,
  } as unknown as Company;
}

function companyToRow(c: Partial<Company>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.name !== undefined) row.name = c.name;
  if (c.ticker !== undefined) row.ticker = c.ticker;
  if (c.exchange !== undefined) row.exchange = c.exchange;
  if (c.cik !== undefined) row.cik = c.cik;
  if (c.sector !== undefined) row.sector = c.sector;
  if (c.city !== undefined) row.city = c.city;
  if (c.state !== undefined) row.state = c.state;
  if (c.description !== undefined) row.description = c.description;
  if (c.approverName !== undefined) row.approver_name = c.approverName;
  if (c.approverTitle !== undefined) row.approver_title = c.approverTitle;
  if (c.xHandle !== undefined) row.x_handle = c.xHandle;
  if (c.peers !== undefined) row.peers = c.peers;
  if (c.tier !== undefined) row.tier = c.tier;
  if (c.quietMode !== undefined) row.quiet_mode = c.quietMode;
  if (c.disclosureText !== undefined) row.disclosure_text = c.disclosureText;
  if (c.flsText !== undefined) row.fls_text = c.flsText;
  if (c.brandColors !== undefined) row.brand_colors = c.brandColors;
  if (c.logoUrl !== undefined) row.logo_url = c.logoUrl;
  if (c.imageStyle !== undefined) row.image_style = c.imageStyle;
  if (c.postGuidance !== undefined) row.post_guidance = c.postGuidance;
  if (c.boardNotifyEmails !== undefined) row.board_notify_emails = c.boardNotifyEmails;
  if (c.onboarding_complete !== undefined) row.onboarding_complete = c.onboarding_complete;
  if (c.ayrshareProfileKey !== undefined) row.ayrshare_profile_key = c.ayrshareProfileKey;
  return row;
}

// Returns the logged-in user's company id + profile, or null if not authed.
// Self-heals: if the user has no company row yet (trigger didn't fire), create one.
// The company the current user works in. Resolves via TEAM MEMBERSHIP first
// (so invited members reach the shared company), then falls back to a company
// they own directly. Self-heals a brand-new company account into a company.
export async function getMyCompany(): Promise<{ id: string; company: Company } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // ── Admin impersonation ──
  // A super-admin can "log in as" any company by setting the impersonate_company
  // cookie (via /api/admin/impersonate). When present AND the caller is a verified
  // super admin, every getMyCompany() call resolves to that company — so the whole
  // app (settings, socials, content) acts on the impersonated company. Anyone who
  // isn't a super admin is ignored, so the cookie alone grants nothing.
  try {
    const { cookies } = await import("next/headers");
    const impersonateId = (await cookies()).get("impersonate_company")?.value;
    if (impersonateId) {
      const { data: admin } = await supabase.from("platform_admins").select("super_admin").eq("user_id", user.id).maybeSingle();
      if (admin?.super_admin) {
        const svc = createServiceClient();
        const { data: c } = await svc.from("companies").select("*").eq("id", impersonateId).maybeSingle();
        if (c) return { id: c.id as string, company: rowToCompany(c) };
      }
    }
  } catch { /* impersonation is best-effort; fall through to normal resolution */ }

  // 1) Active team membership (admin or member). RLS lets a user read their own rows.
  const { data: membership } = await supabase
    .from("company_users")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (membership?.company_id) {
    const { data: c } = await supabase.from("companies").select("*").eq("id", membership.company_id).maybeSingle();
    if (c) {
      // Prevention: this user belongs to a REAL company via membership, but an
      // earlier standalone signup may have left them owning an EMPTY phantom
      // company (the signup trigger mints one for every company signup). That
      // phantom would otherwise linger forever and pollute the admin lists.
      // Clean it up now — safe, because their real membership is what we return.
      try {
        const svc = createServiceClient();
        await svc.from("companies").delete()
          .eq("owner_id", user.id).eq("name", "").eq("ticker", "")
          .neq("id", membership.company_id)
          .is("archived_at", null);
      } catch { /* best-effort cleanup; never block resolution */ }
      return { id: c.id as string, company: rowToCompany(c) };
    }
  }

  // Member (investor) accounts must NOT get a phantom company minted.
  if (user.user_metadata?.account_type === "member") return null;

  // 2) Pending invite for this email (promo/team) that was never accepted via the
  // /accept-invite link. Auto-accept it here so the user lands on the company they
  // were invited to — NOT a fresh free company. This MUST run before the owned-
  // company check below, because the signup trigger mints an EMPTY company for every
  // company-type signup; without this ordering, that empty company would win over a
  // real invite (the "landed on a new upgrade page instead of AMFN" bug).
  {
    const svc = createServiceClient();
    const { data: pending } = await svc
      .from("company_users")
      .select("id, company_id, role, invited_email")
      .ilike("invited_email", user.email ?? "")
      .eq("status", "invited")
      .order("invited_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (pending?.company_id) {
      await svc
        .from("company_users")
        .update({ user_id: user.id, status: "active", invite_token: null, invited_at: null })
        .eq("id", pending.id);
      // First admin to accept claims ownership of an ownerless (promo) company.
      if (pending.role === "admin") {
        const { data: co } = await svc.from("companies").select("owner_id").eq("id", pending.company_id).maybeSingle();
        if (co && !co.owner_id) await svc.from("companies").update({ owner_id: user.id }).eq("id", pending.company_id);
      }
      // Clean up the empty company the signup trigger minted for this user (if any),
      // so it doesn't linger or get picked up later. Only delete a truly-empty one.
      await svc.from("companies").delete().eq("owner_id", user.id).eq("name", "").eq("ticker", "");
      const { data: c } = await supabase.from("companies").select("*").eq("id", pending.company_id).maybeSingle();
      if (c) return { id: c.id as string, company: rowToCompany(c) };
    }
  }

  // 3) Back-compat: a company they own directly (incl. the trigger-minted one).
  const { data } = await supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle();
  if (data) return { id: data.id as string, company: rowToCompany(data) };

  // 4) Brand-new company account with no row yet — mint one + an admin membership.
  const { data: created } = await supabase
    .from("companies")
    .insert({ owner_id: user.id, name: "", ticker: "" })
    .select("*")
    .single();
  if (!created) return null;
  await supabase
    .from("company_users")
    .insert({ company_id: created.id, user_id: user.id, role: "admin", status: "active" });
  return { id: created.id as string, company: rowToCompany(created) };
}

// Public, session-less check: has any company actually claimed this ticker?
// A page is "claimed" when a real company row exists for the ticker with an owner
// (i.e. someone signed up and onboarded it). Uses the service-role client because
// the public ticker page has no auth session. Returns false on any error so the
// page degrades to "unclaimed" rather than crashing.
export async function isTickerClaimed(ticker: string): Promise<boolean> {
  const t = String(ticker ?? "").toUpperCase().trim();
  if (!t) return false;
  try {
    const svc = createServiceClient();
    const { data } = await svc
      .from("companies")
      .select("id, owner_id, onboarding_complete")
      .ilike("ticker", t)
      .not("owner_id", "is", null)
      .limit(1);
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// The signed-in user's role on their resolved company: "admin" | "member" | null.
// Super-admins (platform staff) and the company owner count as admin. Used to gate
// company-wide writes (settings / compliance text) to admins only — RLS scopes to
// the company but does NOT distinguish admin from member.
export async function getMyRole(): Promise<"admin" | "member" | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "admin"; // demo / no-auth mode: treat as admin so local dev works
  const mine = await getMyCompany();
  if (!mine) return null;

  // Platform super-admins can manage any company.
  try {
    const svc = createServiceClient();
    const { data: sa } = await svc.from("platform_admins").select("super_admin").eq("user_id", user.id).maybeSingle();
    if (sa?.super_admin) return "admin";
    // Company owner is always an admin.
    const { data: co } = await svc.from("companies").select("owner_id").eq("id", mine.id).maybeSingle();
    if (co?.owner_id === user.id) return "admin";
  } catch { /* fall through to membership */ }

  const { data: membership } = await supabase
    .from("company_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("company_id", mine.id)
    .eq("status", "active")
    .maybeSingle();
  return membership?.role === "admin" ? "admin" : membership ? "member" : null;
}

export async function updateMyCompany(patch: Partial<Company>): Promise<Company | null> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return null;
  // Scope the update to the user's resolved company (works for members + owners);
  // RLS still enforces they may only write a company they belong to.
  const { data, error } = await supabase
    .from("companies")
    .update(companyToRow(patch))
    .eq("id", mine.id)
    .select("*")
    .single();
  if (error || !data) return null;
  return rowToCompany(data);
}

// Read a JSONB collection (drafts, filings, …) for the user's company.
export async function getCollection<T>(companyId: string, collection: string): Promise<T[]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("company_data")
    .select("data")
    .eq("company_id", companyId)
    .eq("collection", collection)
    .single();
  return ((data?.data as T[]) ?? []) as T[];
}

// Thrown when a concurrent write beat us — the collection changed since load.
// Routes catch this and return 409 so the client reloads instead of losing data.
export class StaleWriteError extends Error {
  collection: string;
  constructor(collection: string) {
    super(`"${collection}" was changed by someone else — reload and try again.`);
    this.name = "StaleWriteError";
    this.collection = collection;
  }
}

export async function setCollection<T>(companyId: string, collection: string, items: T[]): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase
    .from("company_data")
    .upsert({ company_id: companyId, collection, data: items, updated_at: new Date().toISOString() }, { onConflict: "company_id,collection" });
}

const COLLECTIONS = [
  "filings", "drafts", "audit", "investors", "mentions", "metrics",
  "scoreHistory", "publicQuestions", "pressReleases", "disclosureChecks", "calendar",
  "contacts", "documents", "docAnalyses", "convertibleNotes", "capTable",
] as const;

import type { Database } from "../types";

// A mutable, app-shaped DB view backed by Supabase for the logged-in user.
// Load it, mutate db.drafts/db.filings/etc. in place, then call save().
// Returns null when not authenticated (caller falls back to the local JSON store).
export async function loadCompanyDb(): Promise<{ db: Database; companyId: string; save: () => Promise<void> } | null> {
  const mine = await getMyCompany();
  if (!mine) return null;
  const supabase = await createServerSupabase();
  // Try to load WITH the optimistic-concurrency version column. If migration 0002
  // hasn't been applied (column missing), that SELECT errors — fall back to the
  // pre-versioning shape so reads/writes keep working. `hasVersioning` then gates
  // the guarded save path below.
  let data: { collection: string; data: unknown; version?: number }[] | null = null;
  let hasVersioning = true;
  {
    const withVer = await supabase.from("company_data").select("collection, data, version").eq("company_id", mine.id);
    if (withVer.error) {
      hasVersioning = false;
      const noVer = await supabase.from("company_data").select("collection, data").eq("company_id", mine.id);
      data = noVer.data;
    } else {
      data = withVer.data;
    }
  }

  const db = { company: mine.company } as unknown as Database;
  for (const c of COLLECTIONS) (db as unknown as Record<string, unknown>)[c] = [];
  // Version LOADED per collection — the basis for the optimistic check on save.
  // A collection with no row yet is version -1 (so the first write must INSERT).
  const loadedVersion: Record<string, number> = {};
  for (const c of COLLECTIONS) loadedVersion[c] = -1;
  for (const row of data ?? []) {
    (db as unknown as Record<string, unknown>)[row.collection as string] = row.data;
    loadedVersion[row.collection as string] = Number(row.version ?? 0);
  }

  // Snapshot what was LOADED so save() writes only what THIS request changed.
  const baseline: Record<string, string> = {};
  for (const c of COLLECTIONS) baseline[c] = JSON.stringify((db as unknown as Record<string, unknown>)[c] ?? []);
  const companyBaseline = JSON.stringify(db.company);

  const save = async () => {
    // Company profile: only when this request actually changed it.
    if (JSON.stringify(db.company) !== companyBaseline) await updateMyCompany(db.company);
    const dirty = COLLECTIONS.filter(
      (c) => JSON.stringify((db as unknown as Record<string, unknown>)[c] ?? []) !== baseline[c]
    );
    if (dirty.length === 0) return;
    const ts = new Date().toISOString();

    // FALLBACK: if migration 0002 (the version column) isn't applied, use the
    // pre-versioning dirty-only upsert. No optimistic-concurrency protection, but
    // it works — never hard-fail a save because a migration is pending.
    if (!hasVersioning) {
      const rows = dirty.map((c) => ({
        company_id: mine.id, collection: c,
        data: (db as unknown as Record<string, unknown>)[c] ?? [], updated_at: ts,
      }));
      await supabase.from("company_data").upsert(rows, { onConflict: "company_id,collection" });
      for (const c of dirty) baseline[c] = JSON.stringify((db as unknown as Record<string, unknown>)[c] ?? []);
      return;
    }

    // OPTIMISTIC CONCURRENCY: write each dirty collection only if its version is
    // still the one we loaded; bump it. If the row already existed, use a
    // version-guarded UPDATE; if it never existed (loadedVersion === -1), INSERT.
    // Zero rows affected on the guarded update = someone else wrote first =>
    // StaleWriteError, so we reject instead of silently clobbering their change.
    for (const c of dirty) {
      const payload = (db as unknown as Record<string, unknown>)[c] ?? [];
      if (loadedVersion[c] === -1) {
        // First write for this collection. A concurrent insert would violate the
        // (company_id, collection) unique constraint — treat that as a stale write.
        const { error } = await supabase
          .from("company_data")
          .insert({ company_id: mine.id, collection: c, data: payload, version: 0, updated_at: ts });
        if (error) throw new StaleWriteError(c);
        loadedVersion[c] = 0;
      } else {
        const { data: updated } = await supabase
          .from("company_data")
          .update({ data: payload, version: loadedVersion[c] + 1, updated_at: ts })
          .eq("company_id", mine.id)
          .eq("collection", c)
          .eq("version", loadedVersion[c])   // ← the guard
          .select("version");
        if (!updated || updated.length === 0) throw new StaleWriteError(c);
        loadedVersion[c] = loadedVersion[c] + 1;
      }
      // Refresh baseline so a second save() in the same request stays dirty-only.
      baseline[c] = JSON.stringify(payload);
    }
  };

  return { db, companyId: mine.id, save };
}

// Assemble the full app-shaped DB document for the logged-in user (or null if not authed).
export async function getFullDb(): Promise<Record<string, unknown> | null> {
  const mine = await getMyCompany();
  if (!mine) return null;
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("company_data").select("collection, data").eq("company_id", mine.id);
  const byColl: Record<string, unknown> = {};
  for (const c of COLLECTIONS) byColl[c] = [];
  for (const row of data ?? []) byColl[row.collection as string] = row.data;
  // Include the company id on the returned company object. The Company type has
  // no id (it lives on mine.id), but /api/state needs it to resolve capabilities
  // (comped/tier). Without it, co.id was undefined and every company fell to the
  // no-access fallback — which blocked comped companies like AMFN.
  return { company: { ...mine.company, id: mine.id }, ...byColl };
}

import { createServerSupabase } from "./server";
import type { Company } from "../types";

// Maps the snake_case companies row to the app's Company shape and back.
function rowToCompany(r: Record<string, unknown>): Company {
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
    tier: ((r.tier as string) ?? "growth") as Company["tier"],
    quietMode: Boolean(r.quiet_mode),
    disclosureText: (r.disclosure_text as string) ?? "",
    flsText: (r.fls_text as string) ?? "",
    onboarded: Boolean(r.onboarding_complete),
    onboarding_complete: Boolean(r.onboarding_complete),
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
  if (c.onboarding_complete !== undefined) row.onboarding_complete = c.onboarding_complete;
  return row;
}

// Returns the logged-in user's company id + profile, or null if not authed.
// Self-heals: if the user has no company row yet (trigger didn't fire), create one.
export async function getMyCompany(): Promise<{ id: string; company: Company } | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("companies").select("*").eq("owner_id", user.id).maybeSingle();
  if (data) return { id: data.id as string, company: rowToCompany(data) };

  // No row — create one for this user (RLS allows insert where owner_id = auth.uid()).
  const { data: created } = await supabase
    .from("companies")
    .insert({ owner_id: user.id, name: "", ticker: "" })
    .select("*")
    .single();
  if (!created) return null;
  return { id: created.id as string, company: rowToCompany(created) };
}

export async function updateMyCompany(patch: Partial<Company>): Promise<Company | null> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("companies")
    .update(companyToRow(patch))
    .eq("owner_id", user.id)
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
  const { data } = await supabase.from("company_data").select("collection, data").eq("company_id", mine.id);

  const db = { company: mine.company } as unknown as Database;
  for (const c of COLLECTIONS) (db as unknown as Record<string, unknown>)[c] = [];
  for (const row of data ?? []) (db as unknown as Record<string, unknown>)[row.collection as string] = row.data;

  const save = async () => {
    // Persist company profile fields + each collection that exists on db.
    await updateMyCompany(db.company);
    const rows = COLLECTIONS.map((c) => ({
      company_id: mine.id,
      collection: c,
      data: (db as unknown as Record<string, unknown>)[c] ?? [],
      updated_at: new Date().toISOString(),
    }));
    await supabase.from("company_data").upsert(rows, { onConflict: "company_id,collection" });
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
  return { company: mine.company, ...byColl };
}

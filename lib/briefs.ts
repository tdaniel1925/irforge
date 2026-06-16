import { createServerSupabase, createServiceClient } from "./supabase/server";
import { getMyCompany } from "./supabase/store";
import { getPublicTickerAudit } from "./tickerCache";
import { generateSponsoredBrief } from "./ai";
import { writeAudit } from "./platform";

export interface BriefRow {
  id: string;
  ticker: string;
  title: string;
  markdown: string;
  disclosure: string;
  status: string;
  published: boolean;
  createdAt: string;
}

function rowToBrief(r: Record<string, unknown>): BriefRow {
  return {
    id: String(r.id),
    ticker: (r.ticker as string) ?? "",
    title: (r.title as string) ?? "",
    markdown: (r.markdown as string) ?? "",
    disclosure: (r.disclosure as string) ?? "",
    status: (r.status as string) ?? "ordered",
    published: Boolean(r.published),
    createdAt: String(r.created_at ?? ""),
  };
}

// The caller's own briefs.
export async function listMyBriefs(): Promise<BriefRow[]> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return [];
  const { data } = await supabase
    .from("sponsored_briefs")
    .select("*")
    .eq("company_id", mine.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToBrief);
}

// Create an 'ordered' brief row tied to a Stripe checkout session (service role).
export async function createBriefOrder(companyId: string, ticker: string, stripeSessionId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("sponsored_briefs")
    .insert({ company_id: companyId, ticker, status: "ordered", stripe_session_id: stripeSessionId })
    .select("id")
    .single();
  return data ? String(data.id) : null;
}

// After payment: generate the brief content and mark it 'generated' (service role).
// Idempotent — safe to call again on webhook retries.
export async function fulfillBriefBySession(stripeSessionId: string): Promise<void> {
  const svc = createServiceClient();
  const { data: order } = await svc
    .from("sponsored_briefs")
    .select("id, company_id, ticker, status")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  if (!order || order.status === "generated" || order.status === "published") return;

  // Pull the company profile + a fresh audit, then generate.
  const { data: companyRow } = await svc.from("companies").select("*").eq("id", order.company_id).single();
  const ticker = String(order.ticker || companyRow?.ticker || "").toUpperCase();
  const audit = await getPublicTickerAudit(ticker).catch(() => null);
  if (!audit || !companyRow) {
    await svc.from("sponsored_briefs").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);
    return;
  }
  const company = {
    name: companyRow.name, ticker: companyRow.ticker, sector: companyRow.sector,
    description: companyRow.description,
  } as Parameters<typeof generateSponsoredBrief>[0];

  const brief = await generateSponsoredBrief(company, audit);
  await svc.from("sponsored_briefs").update({
    title: brief.title, markdown: brief.markdown, disclosure: brief.disclosure,
    status: "generated", updated_at: new Date().toISOString(),
  }).eq("id", order.id);
  await writeAudit({ companyId: String(order.company_id), action: "brief.generated", entityType: "sponsored_brief", entityId: String(order.id) });
}

// Publish / unpublish a generated brief (owner action via API).
export async function setBriefPublished(briefId: string, published: boolean): Promise<void> {
  const supabase = await createServerSupabase();
  const mine = await getMyCompany();
  if (!mine) return;
  await supabase
    .from("sponsored_briefs")
    .update({ published, status: published ? "published" : "generated", updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .eq("company_id", mine.id);
}

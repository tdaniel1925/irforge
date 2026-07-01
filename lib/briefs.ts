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
  isSample: boolean;
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
    isSample: Boolean(r.is_sample),
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

// The featured public sample brief (is_sample = true, published). Used on the
// marketing site to show prospects what a brief looks like. Read via service
// client so it works for logged-out visitors regardless of RLS.
export async function getSampleBrief(ticker?: string): Promise<BriefRow | null> {
  const svc = createServiceClient();
  let q = svc
    .from("sponsored_briefs")
    .select("*")
    .eq("is_sample", true)
    .eq("published", true)
    .order("created_at", { ascending: false })
    .limit(1);
  if (ticker) q = q.eq("ticker", ticker.toUpperCase());
  const { data } = await q;
  return data && data[0] ? rowToBrief(data[0]) : null;
}

// All published briefs for a ticker (real + sample) — shown on the public
// ticker report page.
export async function getPublishedBriefsForTicker(ticker: string): Promise<BriefRow[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("sponsored_briefs")
    .select("*")
    .eq("ticker", ticker.toUpperCase())
    .eq("published", true)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToBrief);
}

// Create an 'ordered' brief row tied to a Stripe checkout session (service role).
// Returns null on failure — the CALLER MUST abort checkout when this fails, or the
// customer can pay with no order row to fulfill against.
export async function createBriefOrder(companyId: string, ticker: string, stripeSessionId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("sponsored_briefs")
    .insert({ company_id: companyId, ticker, status: "ordered", stripe_session_id: stripeSessionId })
    .select("id")
    .single();
  if (error) console.error("[briefs] order insert failed:", error.message);
  return data ? String(data.id) : null;
}

// After payment: generate the brief content and mark it 'generated' (service role).
// Idempotent — safe to call again on webhook retries and from the reconcile cron.
// Returns ok:false on any failure so the webhook can 5xx (making Stripe retry)
// instead of ACKing a $3,500 payment that produced nothing. Failure paths first mark
// the order 'paid' so the money is never invisible: 'paid' = paid-but-not-generated,
// picked up by retries / the reconcile-briefs cron.
export async function fulfillBriefBySession(stripeSessionId: string): Promise<{ ok: boolean; reason?: string }> {
  const svc = createServiceClient();
  const { data: order } = await svc
    .from("sponsored_briefs")
    .select("id, company_id, ticker, status")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  if (!order) return { ok: false, reason: "no order row for session (checkout insert failed?)" };
  if (order.status === "generated" || order.status === "published") return { ok: true };

  // Money has arrived — record that FIRST, so a crash below never hides the payment.
  await svc.from("sponsored_briefs").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", order.id);

  // Pull the company profile + a fresh audit, then generate.
  const { data: companyRow } = await svc.from("companies").select("*").eq("id", order.company_id).single();
  const ticker = String(order.ticker || companyRow?.ticker || "").toUpperCase();
  const audit = await getPublicTickerAudit(ticker).catch(() => null);
  if (!audit || !companyRow) {
    return { ok: false, reason: !companyRow ? "company row missing" : "ticker audit unavailable" };
  }
  const company = {
    name: companyRow.name, ticker: companyRow.ticker, sector: companyRow.sector,
    description: companyRow.description,
  } as Parameters<typeof generateSponsoredBrief>[0];

  let brief;
  try {
    brief = await generateSponsoredBrief(company, audit);
  } catch (e) {
    return { ok: false, reason: `generation failed: ${e instanceof Error ? e.message : "unknown"}` };
  }
  const { error: saveErr } = await svc.from("sponsored_briefs").update({
    title: brief.title, markdown: brief.markdown, disclosure: brief.disclosure,
    status: "generated", updated_at: new Date().toISOString(),
  }).eq("id", order.id);
  if (saveErr) return { ok: false, reason: `save failed: ${saveErr.message}` };
  await writeAudit({ companyId: String(order.company_id), action: "brief.generated", entityType: "sponsored_brief", entityId: String(order.id) });
  return { ok: true };
}

// Stuck orders for the reconcile cron: paid but never generated.
export async function listStuckPaidBriefs(): Promise<{ id: string; stripeSessionId: string }[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("sponsored_briefs")
    .select("id, stripe_session_id")
    .eq("status", "paid")
    .not("stripe_session_id", "is", null);
  return (data ?? []).map((r) => ({ id: String(r.id), stripeSessionId: String(r.stripe_session_id) }));
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

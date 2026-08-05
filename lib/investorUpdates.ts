import { createServiceClient, createServerSupabase } from "./supabase/server";
import { getMyCompany } from "./supabase/store";
import { checkContent, hasBlockingFlags } from "./compliance";
import { sendEmail } from "./email";
import { writeAudit } from "./platform";
import type { ComplianceFlag } from "./types";

// Investor Updates — broadcast to investors who opted in on the company's public
// page. This is a PUBLIC-company communication, so it runs through the SAME
// compliance gate as posts (no material non-public info, no price predictions),
// and the company's mandatory disclosure/FLS language is appended at send time
// (never editable out), exactly like the publish path.

export interface OptedInRecipient { id: string; name: string; email: string }
export interface InvestorUpdateRow {
  id: string; subject: string; body: string; recipientCount: number; sentByEmail: string; createdAt: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Opted-in contacts that actually have a usable email.
export async function listOptedInRecipients(companyId: string): Promise<OptedInRecipient[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("crm_contacts")
    .select("id, full_name, email")
    .eq("company_id", companyId)
    .eq("opted_in", true)
    .limit(5000);
  return (data ?? [])
    .map((r) => ({ id: String(r.id), name: String(r.full_name ?? ""), email: String(r.email ?? "").trim().toLowerCase() }))
    .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
}

export async function listInvestorUpdates(companyId: string, limit = 50): Promise<InvestorUpdateRow[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("iros_investor_updates")
    .select("id, subject, body, recipient_count, sent_by_email, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: String(r.id), subject: String(r.subject ?? ""), body: String(r.body ?? ""),
    recipientCount: Number(r.recipient_count ?? 0), sentByEmail: String(r.sent_by_email ?? ""),
    createdAt: String(r.created_at ?? ""),
  }));
}

export interface SendResult {
  ok: boolean;
  error?: string;
  flags?: ComplianceFlag[];      // present when blocked by compliance
  sent?: number;
  updateId?: string;
}

// Send an update to every opted-in investor. Compliance-gated; disclosures appended.
export async function sendInvestorUpdate(input: { subject: string; body: string }): Promise<SendResult> {
  const mine = await getMyCompany();
  if (!mine) return { ok: false, error: "Sign in." };
  const svc = createServiceClient();
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const subject = input.subject.trim().slice(0, 200);
  const body = input.body.trim().slice(0, 20000);
  if (!subject) return { ok: false, error: "Add a subject." };
  if (body.length < 10) return { ok: false, error: "Write an update of at least 10 characters." };

  // Compliance gate — same banned-claims filter as posts. Block hard failures.
  const flags = checkContent([subject, body]);
  if (hasBlockingFlags(flags)) {
    return { ok: false, error: "This update contains language that can't be sent to investors — edit the flagged text and try again.", flags };
  }

  const recipients = await listOptedInRecipients(mine.id);
  if (recipients.length === 0) return { ok: false, error: "No investors have opted in to updates yet." };

  // Mandatory disclosure + FLS appended here, in the SEND path (not an editable
  // template) — mirrors the publish path's non-removable disclosures.
  const disclosure = [mine.company.flsText, mine.company.disclosureText].map((s) => (s ?? "").trim()).filter(Boolean).join("\n\n");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:13px;color:#64748b;margin:0 0 12px">Investor update from ${esc(mine.company.name || mine.company.ticker || "the company")}${mine.company.ticker ? ` ($${esc(mine.company.ticker)})` : ""}</p>
    <div style="font-size:15px;line-height:1.6;color:#334155;white-space:pre-wrap">${esc(body)}</div>
    ${disclosure ? `<hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0"/><p style="font-size:11px;line-height:1.5;color:#94a3b8;white-space:pre-wrap">${esc(disclosure)}</p>` : ""}
    <p style="font-size:11px;color:#94a3b8;margin-top:18px">You're receiving this because you opted in to updates on the company's public page.</p>
  </div>`;

  // Send one message per recipient (per-recipient logging + no shared To: leak).
  let sent = 0;
  for (const r of recipients) {
    const ok = await sendEmail({ to: r.email, subject, html, kind: "investor_update" }).catch(() => false);
    if (ok) sent++;
  }

  // Record the broadcast.
  const { data: rec } = await svc.from("iros_investor_updates").insert({
    company_id: mine.id, subject, body, recipient_count: sent,
    sent_by: user?.id ?? null, sent_by_email: user?.email ?? "",
  }).select("id").single();

  await writeAudit({
    companyId: mine.id, actorUserId: user?.id, actorEmail: user?.email,
    action: "investor_update.sent", entityType: "investor_update", entityId: rec ? String(rec.id) : undefined,
    payload: { subject, recipients: sent, ofOptedIn: recipients.length },
  });

  return { ok: true, sent, updateId: rec ? String(rec.id) : undefined };
}

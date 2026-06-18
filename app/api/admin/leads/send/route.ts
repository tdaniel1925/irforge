import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/platform";
import { sendOutreachEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// Daily outreach cap — protects sending-domain reputation. Override with OUTREACH_DAILY_CAP.
const DAILY_CAP = Number(process.env.OUTREACH_DAILY_CAP) || 25;

// Turn the operator's plain-text message into safe HTML, substituting {company}/{ticker}/{name}.
function renderBody(template: string, lead: { name: string; ticker: string; contact_name: string }): string {
  const filled = template
    .replace(/\{company\}/g, lead.name || "your company")
    .replace(/\{ticker\}/g, lead.ticker || "")
    .replace(/\{name\}/g, lead.contact_name || "there");
  const safe = filled.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
  return `<p style="font-size:14px;line-height:1.6;color:#475569;margin:0">${safe}</p>`;
}

// POST: send approved outreach.
// { listId, subject, template, leadIds?: string[] }  — if leadIds omitted, sends to all
// leads in the list that have an email and status 'new' or 'queued'. Honors the daily cap.
export async function POST(req: Request) {
  if (!(await isSuperAdmin())) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const svc = createServiceClient();
  const b = await req.json().catch(() => ({}));
  const listId = String(b.listId || "");
  const subject = String(b.subject || "").trim();
  const template = String(b.template || "").trim();
  const leadIds: string[] | undefined = Array.isArray(b.leadIds) ? b.leadIds.map(String) : undefined;

  if (!listId || !subject || !template) return NextResponse.json({ error: "listId, subject and template are required." }, { status: 422 });

  // How many have we already sent in the last 24h? (cap is global, not per-list.)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: sentToday } = await svc.from("outreach_leads").select("id", { count: "exact", head: true }).gte("last_sent_at", since);
  const remaining = Math.max(0, DAILY_CAP - (sentToday ?? 0));
  if (remaining === 0) {
    return NextResponse.json({ error: `Daily send cap reached (${DAILY_CAP}/day). Try again tomorrow — this protects your domain reputation.`, sent: 0, capped: true }, { status: 429 });
  }

  // Pick the recipients: must have an email, not already sent.
  let q = svc.from("outreach_leads").select("*").eq("list_id", listId).neq("email", "").in("status", ["new", "queued"]);
  if (leadIds && leadIds.length) q = q.in("id", leadIds);
  const { data: leads, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const batch = (leads ?? []).slice(0, remaining);
  let sent = 0;
  const errors: string[] = [];
  for (const lead of batch) {
    try {
      const messageId = await sendOutreachEmail({
        to: lead.email,
        subject: subject.replace(/\{ticker\}/g, lead.ticker || "").replace(/\{company\}/g, lead.name || ""),
        bodyHtml: renderBody(template, lead),
      });
      await svc.from("outreach_leads").update({ status: "sent", message_id: messageId ?? "", last_sent_at: new Date().toISOString() }).eq("id", lead.id);
      sent++;
    } catch (e) {
      errors.push(`${lead.ticker}: ${e instanceof Error ? e.message.slice(0, 80) : "failed"}`);
    }
  }

  const skipped = (leads ?? []).length - batch.length;
  return NextResponse.json({ sent, skipped, capRemaining: Math.max(0, remaining - sent), errors });
}

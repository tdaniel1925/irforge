// Transactional email via Resend (https://resend.com). Uses the REST API
// directly so we don't depend on the SDK. All senders are best-effort: callers
// must catch — a mail failure should never break the user-facing action.
//
// Required env:
//   RESEND_API_KEY     — your Resend API key
//   EMAIL_FROM         — verified sender for transactional mail, e.g. "PubcoZone <alerts@pubcozone.com>"
//   OUTREACH_FROM      — verified sender for COLD OUTREACH, on a separate subdomain,
//                        e.g. "Trent at PubcoZone <trent@outreach.pubcozone.com>".
//                        Kept apart so outreach complaints never taint transactional deliverability.
//   OUTREACH_REPLY_TO  — where replies to outreach should land (your inbox).

const FROM = process.env.EMAIL_FROM || "PubcoZone <alerts@pubcozone.com>";
const OUTREACH_FROM = process.env.OUTREACH_FROM || "PubcoZone <outreach@outreach.pubcozone.com>";
const SITE = "https://pubcozone.com";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

// Log one email to the email_events ops table (best-effort — never throws).
async function logEmail(row: { message_id?: string; to_email: string; kind?: string; subject?: string; status: string; error?: string }) {
  try {
    const { createServiceClient } = await import("./supabase/server");
    await createServiceClient().from("email_events").insert({
      message_id: row.message_id ?? null,
      to_email: row.to_email,
      kind: row.kind ?? "",
      subject: row.subject ?? "",
      status: row.status,
      error: row.error ?? "",
    });
  } catch (e) {
    console.error("[email] log failed:", e instanceof Error ? e.message : e);
  }
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string; // override the sender (outreach uses the dedicated subdomain)
  kind?: string; // for the delivery log (promo_invite, team_invite, welcome, outreach, ...)
}): Promise<boolean> {
  return Boolean(await sendEmailRaw(opts));
}

// Like sendEmail but returns the Resend message id (or null) so callers (outreach)
// can persist it and match webhook delivery events back to a specific lead.
export async function sendEmailRaw(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
  kind?: string;
}): Promise<string | null> {
  const toEmail = Array.isArray(opts.to) ? opts.to[0] : opts.to;
  if (!emailEnabled()) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", opts.to);
    return null;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from || FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    await logEmail({ to_email: toEmail, kind: opts.kind, subject: opts.subject, status: "failed", error: `${res.status}: ${text.slice(0, 200)}` });
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => ({} as { id?: string }));
  await logEmail({ message_id: data?.id, to_email: toEmail, kind: opts.kind, subject: opts.subject, status: "sent" });
  return data?.id ?? null;
}

// Cold outreach to a prospective company. Sent from the dedicated OUTREACH subdomain,
// with a reply-to to your inbox and a one-click unsubscribe footer (CAN-SPAM).
// Returns the Resend message id so the lead row can track delivery.
export async function sendOutreachEmail(o: {
  to: string;
  subject: string;
  bodyHtml: string; // the operator's message (already HTML/escaped)
  unsubscribeUrl?: string;
}): Promise<string | null> {
  const replyTo = process.env.OUTREACH_REPLY_TO || undefined;
  const unsub = o.unsubscribeUrl
    ? `<a href="${o.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline">unsubscribe</a>`
    : `reply with "unsubscribe" and we'll remove you`;
  const footer = `You're receiving this because $${""}PubcoZone identified your company in public SEC filings. Not interested? ${unsub}. PubcoZone, an AI investor-relations platform.`;
  const html = shell(o.bodyHtml, footer);
  return sendEmailRaw({ to: o.to, subject: o.subject, html, from: OUTREACH_FROM, replyTo, kind: "outreach" });
}

// Shared shell so every email looks on-brand: WHITE background, logo at top, dark text.
function shell(inner: string, footer?: string): string {
  const foot = footer ??
    `Not investment advice — PubcoZone surfaces public data and companies' own answers.`;
  return `<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
      <div style="padding:20px 32px;border-bottom:1px solid #eef2f7">
        <span style="font-size:22px;font-weight:800;color:#0f172a">Pubco</span><span style="font-size:22px;font-weight:800;color:#059669">Zone.</span>
      </div>
      <div style="padding:28px 32px;color:#334155">
        ${inner}
      </div>
      <div style="padding:16px 32px;border-top:1px solid #eef2f7">
        <p style="font-size:11px;color:#94a3b8;line-height:1.6;margin:0">
          ${foot} <a href="${SITE}" style="color:#059669;text-decoration:none">pubcozone.com</a>
        </p>
      </div>
    </div>
  </div>`;
}

export async function sendWatchConfirmation(to: string, ticker: string): Promise<boolean> {
  const inner = `
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 10px">You're watching $${ticker} ✅</h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 16px">
      We'll email you when something that actually matters happens on <strong style="color:#0f172a">$${ticker}</strong>:
    </p>
    <ul style="font-size:14px;line-height:1.8;color:#475569;margin:0 0 20px;padding-left:20px">
      <li>A new SEC filing (8-K, 10-Q, 10-K)</li>
      <li>Insider buying or selling (Form 4)</li>
      <li>A trading halt</li>
      <li>A change in the Visibility Grade</li>
      <li>A verified answer from the company</li>
    </ul>
    <a href="${SITE}/t/${ticker}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:9px">
      View the $${ticker} report →
    </a>`;
  return sendEmail({ to, subject: `You're now watching $${ticker} on PubcoZone`, html: shell(inner) });
}

// Promo / free-access invite emailed by an admin to a company. Branded shell, with
// a one-line "what this is" so cold recipients aren't confused.
export interface PromoInviteOpts {
  to: string;
  link: string;
  companyName?: string;
  contactName?: string;
  invitedBy?: string;
  message?: string; // admin's custom body (plain text); default used if empty
}

// Escape user-entered text + turn newlines into <br> for safe HTML embedding.
function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
}

// The default editable message body (without the button — the button is always
// appended by the renderer and can never be edited away).
export function defaultPromoMessage(companyName?: string, contactName?: string): string {
  const hi = contactName ? `Hi ${contactName},` : "Hi there,";
  const who = companyName ? ` for ${companyName}` : "";
  return `${hi}\n\nPubcoZone is an AI investor-relations platform for public companies — turn your SEC filings into compliant updates you approve, answer investors on the record, and reach the funds that hold your peers. Nothing ever posts without your approval.\n\nYou've been set up with full, free access${who} — every feature, no charge and no card required. Click the button below to activate your account with this email and connect your ticker.`;
}

// Render the invite email HTML (used for both the live preview and the actual send),
// so what the admin previews is exactly what goes out. The activation button + link
// are rendered separately and CANNOT be removed by editing the message.
export function renderPromoInviteHtml(o: { link: string; message: string; invitedBy?: string }): string {
  const fromLine = o.invitedBy
    ? `<p style="font-size:13px;color:#94a3b8;margin:0 0 14px">${esc(o.invitedBy)} invited you to PubcoZone.</p>`
    : "";
  const inner = `
    <h1 style="font-size:21px;color:#0f172a;margin:0 0 8px">You've been given free access to PubcoZone 🎁</h1>
    ${fromLine}
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 18px">${esc(o.message)}</p>
    <a href="${o.link}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:9px">
      Activate free access →
    </a>
    <p style="font-size:12px;color:#64748b;margin:18px 0 0">
      Or paste this link into your browser:<br/><span style="color:#94a3b8">${o.link}</span>
    </p>`;
  return shell(inner);
}

export async function sendPromoInviteEmail(o: PromoInviteOpts): Promise<boolean> {
  const message = (o.message && o.message.trim()) || defaultPromoMessage(o.companyName, o.contactName);
  const html = renderPromoInviteHtml({ link: o.link, message, invitedBy: o.invitedBy });
  return sendEmail({ to: o.to, subject: `Your free access to PubcoZone${o.companyName ? ` — ${o.companyName}` : ""}`, html, kind: "promo_invite" });
}

// Welcome / setup guide emailed to a new (or comped) company so they know exactly
// how to get set up. The full version lives in-app at /help/setup.
export async function sendCompanyWelcomeGuide(to: string, companyName?: string): Promise<boolean> {
  const who = companyName ? ` for <strong style="color:#0f172a">${companyName}</strong>` : "";
  const step = (n: string, t: string, d: string) =>
    `<tr><td style="padding:0 0 14px"><table cellpadding="0" cellspacing="0"><tr>
       <td valign="top" style="width:30px"><span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:12px;background:#10b981;color:#fff;font-weight:700;font-size:13px">${n}</span></td>
       <td style="font-size:14px;color:#475569;line-height:1.55"><strong style="color:#0f172a">${t}</strong><br/>${d}</td>
     </tr></table></td></tr>`;
  const inner = `
    <h1 style="font-size:21px;color:#0f172a;margin:0 0 8px">Welcome to PubcoZone${who} 👋</h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 18px">
      Your investor-relations program, in one place. Getting set up takes about 10 minutes — and nothing ever posts without your approval.
    </p>
    <table cellpadding="0" cellspacing="0" style="width:100%">
      ${step("1", "Connect your ticker", "We pull your SEC profile from EDGAR and draft your first posts automatically.")}
      ${step("2", "Confirm your profile & approver", "Check the auto-filled details and name who signs off on posts.")}
      ${step("3", "Connect your social accounts", "In Settings — approved posts publish to your own X / LinkedIn / etc.")}
      ${step("4", "Invite your team", "Add admins and members; everyone shares the dashboard, each gets a private workspace.")}
    </table>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:16px 0 20px">
      Your <strong style="color:#0f172a">Get started</strong> checklist tracks everything and checks items off as you go.
    </p>
    <a href="${SITE}/setup" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:9px">
      Start setup →
    </a>
    <p style="font-size:12px;color:#64748b;margin:18px 0 0">
      Full walkthrough any time: <a href="${SITE}/help/setup" style="color:#34d399">How setup works</a>.
    </p>`;
  return sendEmail({ to, subject: `Getting started on PubcoZone${companyName ? ` — ${companyName}` : ""}`, html: shell(inner), kind: "welcome" });
}

// Used by the alert worker when a watched ticker has news. (Wired for later use.)
export async function sendWatchAlert(to: string, ticker: string, headline: string, detail: string): Promise<boolean> {
  const inner = `
    <p style="font-size:12px;color:#34d399;font-weight:700;letter-spacing:.5px;margin:0 0 6px">$${ticker} ALERT</p>
    <h1 style="font-size:19px;color:#0f172a;margin:0 0 10px">${headline}</h1>
    <p style="font-size:14px;line-height:1.6;color:#475569;margin:0 0 20px">${detail}</p>
    <a href="${SITE}/t/${ticker}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:9px">
      See the full $${ticker} report →
    </a>`;
  return sendEmail({ to, subject: `$${ticker}: ${headline}`, html: shell(inner) });
}

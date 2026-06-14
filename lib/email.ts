// Transactional email via Resend (https://resend.com). Uses the REST API
// directly so we don't depend on the SDK. All senders are best-effort: callers
// must catch — a mail failure should never break the user-facing action.
//
// Required env:
//   RESEND_API_KEY     — your Resend API key
//   EMAIL_FROM         — verified sender, e.g. "PubcoZone <alerts@pubcozone.com>"

const FROM = process.env.EMAIL_FROM || "PubcoZone <alerts@pubcozone.com>";
const SITE = "https://pubcozone.com";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!emailEnabled()) {
    console.warn("[email] RESEND_API_KEY not set — skipping send to", opts.to);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }
  return true;
}

// Shared shell so every email looks on-brand.
function shell(inner: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#04060c;border-radius:14px;padding:32px;color:#e2e8f0">
    <div style="font-size:22px;font-weight:800;margin-bottom:18px">
      <span style="color:#ecfdf5">Pubco</span><span style="color:#34d399">Zone.</span>
    </div>
    ${inner}
    <hr style="border:none;border-top:1px solid #1e293b;margin:26px 0 14px"/>
    <p style="font-size:11px;color:#64748b;line-height:1.6;margin:0">
      You're receiving this because you asked PubcoZone to watch a ticker. Not investment advice —
      we surface public data and the company's own answers. <a href="${SITE}" style="color:#34d399">pubcozone.com</a>
    </p>
  </div>`;
}

export async function sendWatchConfirmation(to: string, ticker: string): Promise<boolean> {
  const inner = `
    <h1 style="font-size:20px;color:#ffffff;margin:0 0 10px">You're watching $${ticker} ✅</h1>
    <p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 16px">
      We'll email you when something that actually matters happens on <strong style="color:#fff">$${ticker}</strong>:
    </p>
    <ul style="font-size:14px;line-height:1.8;color:#cbd5e1;margin:0 0 20px;padding-left:20px">
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

// Used by the alert worker when a watched ticker has news. (Wired for later use.)
export async function sendWatchAlert(to: string, ticker: string, headline: string, detail: string): Promise<boolean> {
  const inner = `
    <p style="font-size:12px;color:#34d399;font-weight:700;letter-spacing:.5px;margin:0 0 6px">$${ticker} ALERT</p>
    <h1 style="font-size:19px;color:#ffffff;margin:0 0 10px">${headline}</h1>
    <p style="font-size:14px;line-height:1.6;color:#cbd5e1;margin:0 0 20px">${detail}</p>
    <a href="${SITE}/t/${ticker}" style="display:inline-block;background:#10b981;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:9px">
      See the full $${ticker} report →
    </a>`;
  return sendEmail({ to, subject: `$${ticker}: ${headline}`, html: shell(inner) });
}

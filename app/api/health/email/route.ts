import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Safe deploy diagnostic for the Postmark email integration. Reports ONLY booleans —
// never any secret value — so you can confirm on a live deployment that email is
// configured. Exposes no secrets, safe to leave public.
export async function GET() {
  const token = Boolean(process.env.POSTMARK_SERVER_TOKEN);
  const webhookUser = Boolean(process.env.POSTMARK_WEBHOOK_USER);
  const webhookPass = Boolean(process.env.POSTMARK_WEBHOOK_PASS);

  return NextResponse.json({
    // The single answer: can the app send mail on this deployment?
    emailEnabled: token,
    // Whether the delivery/bounce webhook is protected (fails closed in prod if not).
    webhookProtected: webhookUser && webhookPass,
    checks: {
      POSTMARK_SERVER_TOKEN_present: token,
      // Stream ids are not secret — show them so you can eyeball a typo.
      POSTMARK_STREAM: process.env.POSTMARK_STREAM || "(default: outbound)",
      POSTMARK_BROADCAST_STREAM: process.env.POSTMARK_BROADCAST_STREAM || "(default: broadcast)",
      POSTMARK_WEBHOOK_USER_present: webhookUser,
      POSTMARK_WEBHOOK_PASS_present: webhookPass,
      EMAIL_FROM: process.env.EMAIL_FROM || "(default: alerts@pubcozone.com)",
      OUTREACH_FROM_present: Boolean(process.env.OUTREACH_FROM),
    },
    note: token
      ? "Email is configured (Postmark). Inbox placement still depends on DKIM/SPF/DMARC + sender reputation."
      : "POSTMARK_SERVER_TOKEN not set — email sends are skipped on this deployment.",
  });
}

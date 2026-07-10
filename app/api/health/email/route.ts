import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Safe deploy diagnostic for the Resend email integration. Reports ONLY booleans —
// never any secret value — so you can confirm on a live deployment that email is
// configured. Exposes no secrets, safe to leave public.
export async function GET() {
  const key = Boolean(process.env.RESEND_API_KEY);
  const webhookSecret = Boolean(process.env.RESEND_WEBHOOK_SECRET);

  return NextResponse.json({
    // The single answer: can the app send mail on this deployment?
    emailEnabled: key,
    // Whether the delivery/bounce webhook signature is verified (fails closed in prod if not).
    webhookProtected: webhookSecret,
    checks: {
      RESEND_API_KEY_present: key,
      RESEND_WEBHOOK_SECRET_present: webhookSecret,
      EMAIL_FROM: process.env.EMAIL_FROM || "(default: alerts@pubcozone.com)",
      OUTREACH_FROM_present: Boolean(process.env.OUTREACH_FROM),
      OUTREACH_REPLY_TO_present: Boolean(process.env.OUTREACH_REPLY_TO),
    },
    note: key
      ? "Email is configured (Resend). Inbox placement still depends on DKIM/SPF/DMARC + sender reputation."
      : "RESEND_API_KEY not set — email sends are skipped on this deployment.",
  });
}

import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Resend webhook — updates the email_events delivery log when Resend reports a
// status change (delivered / bounced / opened / complained). Resend signs payloads
// with the Svix scheme; set RESEND_WEBHOOK_SECRET (starts with "whsec_") to verify.
//
// Add the endpoint in the Resend dashboard → Webhooks:
//   https://pubcozone.com/api/email/webhook
// and subscribe to email.delivered, email.bounced, email.opened, email.complained.

function verifySvix(secret: string, headers: Headers, payload: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  // Secret is "whsec_<base64>"; the signing key is the base64-decoded part.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${id}.${ts}.${payload}`;
  const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
  // Header is space-separated list of "v1,<sig>" entries.
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; subject?: string };
};

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  // If a secret is configured, enforce it. If not, accept (dev) but log a warning.
  if (secret) {
    if (!verifySvix(secret, req.headers, raw)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
    }
  } else {
    console.warn("[email-webhook] RESEND_WEBHOOK_SECRET not set — accepting unverified");
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const messageId = event.data?.email_id;
  const when = event.created_at || new Date().toISOString();
  if (!messageId || !event.type) return NextResponse.json({ received: true });

  // Map Resend event types onto our status + timestamp columns.
  const patch: Record<string, string> = {};
  switch (event.type) {
    case "email.delivered":
      patch.status = "delivered";
      patch.delivered_at = when;
      break;
    case "email.opened":
      patch.status = "opened";
      patch.opened_at = when;
      break;
    case "email.bounced":
      patch.status = "bounced";
      patch.error = "bounced";
      break;
    case "email.complained":
      patch.status = "complained";
      patch.error = "spam complaint";
      break;
    case "email.delivery_delayed":
      patch.status = "delayed";
      break;
    default:
      return NextResponse.json({ received: true }); // ignore email.sent etc.
  }

  try {
    await createServiceClient().from("email_events").update(patch).eq("message_id", messageId);
  } catch (e) {
    console.error("[email-webhook] update failed:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ received: true });
}

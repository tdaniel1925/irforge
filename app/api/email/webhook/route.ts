import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Resend webhook — updates the email_events delivery log when Resend reports a status
// change (email.delivered / email.bounced / email.opened / email.complained). Resend
// signs payloads with Svix (HMAC-SHA256). Set the endpoint's signing secret in env:
//   RESEND_WEBHOOK_SECRET   (starts with "whsec_")
//
// Configure at Resend → Webhooks → Add endpoint:
//   https://pubcozone.com/api/email/webhook
// subscribe to email.delivered, email.bounced, email.opened, email.complained.

// Verify a Svix signature (the scheme Resend uses). The signed content is
// `${id}.${timestamp}.${payload}`, HMAC-SHA256 with the base64 secret (after the
// "whsec_" prefix), compared constant-time against any of the space-separated
// `v1,<sig>` values in the svix-signature header.
function verifySvix(secret: string, headers: Headers, payload: string): boolean {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !timestamp || !sigHeader) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${id}.${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  // Header looks like: "v1,<sig1> v1,<sig2>"
  for (const part of sigHeader.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    try {
      if (sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return true;
    } catch {
      /* length mismatch — try next */
    }
  }
  return false;
}

// Resend posts one event object; `type` tells the kind, and the message id + email
// live under `data`.
type ResendEvent = {
  type?: string; // email.sent | email.delivered | email.bounced | email.opened | email.complained | ...
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    bounce?: { type?: string };
  };
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const raw = await req.text();

  // Enforce signature verification when configured. When it ISN'T configured, fail
  // closed in production (anyone could otherwise flip lead delivery statuses); accept
  // in dev.
  if (secret) {
    if (!verifySvix(secret, req.headers, raw)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.AUTH_ENABLED === "1") {
    console.error("[email-webhook] RESEND_WEBHOOK_SECRET not set — rejecting in production");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  } else {
    console.warn("[email-webhook] RESEND_WEBHOOK_SECRET not set — accepting unverified (dev)");
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

  // Map Resend event type onto our status + timestamp columns.
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
      patch.error = event.data?.bounce?.type ? `bounce: ${event.data.bounce.type}` : "bounced";
      break;
    case "email.complained":
      patch.status = "complained";
      patch.error = "spam complaint";
      break;
    default:
      return NextResponse.json({ received: true }); // ignore email.sent, email.delivery_delayed, etc.
  }

  try {
    const svc = createServiceClient();
    const { error } = await svc.from("email_events").update(patch).eq("message_id", messageId);
    if (error) throw new Error(error.message);
    // Mirror outreach status onto the lead row so the Lead Finder shows delivered/opened/bounced.
    if (patch.status && ["delivered", "opened", "bounced"].includes(patch.status)) {
      const { error: e2 } = await svc.from("outreach_leads").update({ status: patch.status }).eq("message_id", messageId);
      if (e2) throw new Error(e2.message);
    }
  } catch (e) {
    console.error("[email-webhook] update failed:", e instanceof Error ? e.message : e);
    // 5xx so Resend redelivers — ACKing a failed write permanently lost the status.
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

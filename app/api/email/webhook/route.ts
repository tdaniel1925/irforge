import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Postmark webhook — updates the email_events delivery log when Postmark reports a
// status change (Delivery / Bounce / Open / SpamComplaint). Postmark doesn't sign
// payloads; it authenticates by HTTP Basic Auth on the webhook URL. Set a
// username:password when configuring the webhook and mirror it in env:
//   POSTMARK_WEBHOOK_USER, POSTMARK_WEBHOOK_PASS
//
// Configure at Postmark → Servers → your server → Webhooks, endpoint:
//   https://<user>:<pass>@pubcozone.com/api/email/webhook
// subscribe to Delivery, Bounce, Open, Spam Complaint.

// Constant-time compare of the incoming Basic-Auth header against expected creds.
function checkBasicAuth(req: Request, user: string, pass: string): boolean {
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
  const got = "Basic " + m[1];
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Postmark posts one event object; RecordType tells the kind.
type PostmarkEvent = {
  RecordType?: string;   // Delivery | Bounce | Open | SpamComplaint | SubscriptionChange | ...
  MessageID?: string;
  DeliveredAt?: string;
  ReceivedAt?: string;
  BouncedAt?: string;
  Type?: string;         // bounce sub-type
};

export async function POST(req: Request) {
  const user = process.env.POSTMARK_WEBHOOK_USER;
  const pass = process.env.POSTMARK_WEBHOOK_PASS;
  // Enforce Basic Auth when configured. When it ISN'T configured, fail closed in
  // production (anyone could otherwise flip lead delivery statuses); accept in dev.
  if (user && pass) {
    if (!checkBasicAuth(req, user, pass)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.AUTH_ENABLED === "1") {
    console.error("[email-webhook] POSTMARK_WEBHOOK_USER/PASS not set — rejecting in production");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  } else {
    console.warn("[email-webhook] POSTMARK_WEBHOOK_USER/PASS not set — accepting unverified (dev)");
  }

  const raw = await req.text();
  let event: PostmarkEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const messageId = event.MessageID;
  const when = event.DeliveredAt || event.BouncedAt || event.ReceivedAt || new Date().toISOString();
  if (!messageId || !event.RecordType) return NextResponse.json({ received: true });

  // Map Postmark RecordType onto our status + timestamp columns.
  const patch: Record<string, string> = {};
  switch (event.RecordType) {
    case "Delivery":
      patch.status = "delivered";
      patch.delivered_at = when;
      break;
    case "Open":
      patch.status = "opened";
      patch.opened_at = when;
      break;
    case "Bounce":
      patch.status = "bounced";
      patch.error = event.Type ? `bounce: ${event.Type}` : "bounced";
      break;
    case "SpamComplaint":
      patch.status = "complained";
      patch.error = "spam complaint";
      break;
    default:
      return NextResponse.json({ received: true }); // ignore SubscriptionChange etc.
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
    // 5xx so Postmark redelivers — ACKing a failed write permanently lost the status.
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

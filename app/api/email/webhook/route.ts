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
  // Reject stale timestamps (±5 min) — a valid signature must not be replayable
  // forever (e.g. re-flipping a bounced lead back to delivered).
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) return false;
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
  // Enforce the signature when configured. When it ISN'T configured, fail closed in
  // production (previously accepted anything with only a console warning — anyone
  // could flip lead delivery statuses); accept only in local dev.
  if (secret) {
    if (!verifySvix(secret, req.headers, raw)) {
      return NextResponse.json({ error: "Bad signature" }, { status: 400 });
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
    // 5xx so Svix redelivers — ACKing a failed write permanently lost the status.
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

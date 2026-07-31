import crypto from "crypto";
import { createServiceClient } from "../supabase/server";
import { writeAudit } from "../platform";
import { requireScope, ServiceError, type ActorContext } from "./context";
import { encryptSecret } from "../events/secretbox";

// ── Event subscription management (the notification on/off switch) ──
// A connected client registers a callback URL and receives a signing secret
// (returned ONCE). enabled=true/false is the notification toggle, flippable from
// PubcoZone's UI, Jordyn's UI, or a chat command. All company-scoped.

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export interface SubscriptionStatus { registered: boolean; enabled: boolean; callbackUrl: string | null }

// Register (or re-register) a callback for the actor's company. Generates a fresh
// signing secret and returns it in plaintext ONCE; only its hash + an encrypted
// copy are stored. Idempotent on (company, callback_url): re-registering rotates
// the secret.
export async function registerEventCallback(ctx: ActorContext, callbackUrl: string): Promise<{ secret: string; enabled: boolean }> {
  requireScope(ctx, "events:manage");
  if (!/^https:\/\//.test(callbackUrl) && !/^http:\/\/localhost(:\d+)?\//.test(callbackUrl)) {
    throw new ServiceError("invalid", "callback_url must be https (or http://localhost for dev).");
  }
  const svc = createServiceClient();
  const secret = `pzevt_${crypto.randomBytes(32).toString("base64url")}`;
  const row = {
    company_id: ctx.companyId,
    callback_url: callbackUrl.slice(0, 500),
    secret_hash: sha256(secret),
    secret_enc: encryptSecret(secret),
    enabled: true,
    updated_at: new Date().toISOString(),
  };
  // Upsert on the unique (company_id, callback_url).
  const { data: existing } = await svc.from("iros_event_subscriptions").select("id").eq("company_id", ctx.companyId).eq("callback_url", row.callback_url).maybeSingle();
  if (existing) {
    await svc.from("iros_event_subscriptions").update(row).eq("id", existing.id);
  } else {
    await svc.from("iros_event_subscriptions").insert(row);
  }
  await writeAudit({
    companyId: ctx.companyId, actorUserId: ctx.actorId.replace(/^(oauth|token):/, ""), actorEmail: ctx.actorEmail,
    action: "events.callback_registered", entityType: "event_subscription", entityId: row.callback_url,
    payload: { requestId: ctx.requestId, authMethod: ctx.authMethod },
  });
  return { secret, enabled: true };
}

// Flip notifications on/off for the actor's company (all its subscriptions).
export async function setNotifications(ctx: ActorContext, enabled: boolean): Promise<{ enabled: boolean }> {
  requireScope(ctx, "events:manage");
  const svc = createServiceClient();
  await svc.from("iros_event_subscriptions").update({ enabled, updated_at: new Date().toISOString() }).eq("company_id", ctx.companyId);
  await writeAudit({
    companyId: ctx.companyId, actorUserId: ctx.actorId.replace(/^(oauth|token):/, ""), actorEmail: ctx.actorEmail,
    action: enabled ? "events.enabled" : "events.disabled", entityType: "event_subscription",
    payload: { requestId: ctx.requestId, authMethod: ctx.authMethod },
  });
  return { enabled };
}

export async function getNotificationStatus(ctx: ActorContext): Promise<SubscriptionStatus> {
  requireScope(ctx, "events:manage");
  const svc = createServiceClient();
  const { data } = await svc.from("iros_event_subscriptions").select("callback_url, enabled").eq("company_id", ctx.companyId).order("created_at", { ascending: false }).limit(1);
  const row = data?.[0];
  if (!row) return { registered: false, enabled: false, callbackUrl: null };
  return { registered: true, enabled: Boolean(row.enabled), callbackUrl: String(row.callback_url) };
}

// Session-side toggle for PubcoZone's own Connections UI (no scope object needed —
// the route passes an ActorContext built from the session).

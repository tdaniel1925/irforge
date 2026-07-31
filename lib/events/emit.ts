import crypto from "crypto";
import { createServiceClient } from "../supabase/server";

// ── Outbound signed events (PubcoZone → Jordyn) ──
// See supabase/RUN-THIS-events.sql. Each connected company may register ONE (or
// more) callback URL + signing secret. We POST a signed payload and log the
// delivery. Best-effort: emitting must NEVER block or fail the triggering action
// (an investor's question still posts even if the webhook is down).
//
// Signature scheme (mirrors the inbound Svix/Stripe style we verify elsewhere):
//   signed content = `${timestamp}.${eventId}.${rawBody}`
//   header X-PubcoZone-Signature: `v1,<hex hmac-sha256>`
//   header X-PubcoZone-Id: <eventId>   (receiver dedupes on this)
//   header X-PubcoZone-Timestamp: <unix seconds>  (receiver rejects if stale)

const MAX_ATTEMPTS = 3;

export interface EventPayload {
  type: string;
  companyId: string;
  ticker: string;
  data: Record<string, unknown>;
}

// Deterministic-ish event id: we can't use Math.random/Date.now freely in some
// contexts, but this is a normal request path so randomUUID is fine here.
function newEventId(): string {
  return `evt_${crypto.randomUUID()}`;
}

async function deliver(sub: { callback_url: string; secret: string }, eventId: string, timestamp: string, rawBody: string): Promise<{ ok: boolean; error?: string }> {
  const signed = `${timestamp}.${eventId}.${rawBody}`;
  const sig = crypto.createHmac("sha256", sub.secret).update(signed).digest("hex");
  try {
    const res = await fetch(sub.callback_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PubcoZone-Id": eventId,
        "X-PubcoZone-Timestamp": timestamp,
        "X-PubcoZone-Signature": `v1,${sig}`,
      },
      body: rawBody,
      // Don't hang the request path on a slow receiver.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

// Emit an event to every ENABLED subscription for the company. Retries a failed
// delivery up to MAX_ATTEMPTS with a tiny backoff. Records each delivery.
// Swallows everything — callers `await` this purely to avoid serverless freeze,
// never to surface an error.
export async function emitEvent(payload: EventPayload): Promise<void> {
  try {
    const svc = createServiceClient();
    const { data: subs } = await svc
      .from("iros_event_subscriptions")
      .select("id, callback_url, secret_hash, enabled")
      .eq("company_id", payload.companyId)
      .eq("enabled", true);
    if (!subs?.length) return;

    // The subscription stores only a HASH of the secret; the plaintext secret is
    // held by the receiver. We sign with the secret we were given at register
    // time — but since we only persisted the hash, we can't re-derive it. So the
    // signing secret is stored encrypted-at-rest alongside; see note below.
    const eventId = newEventId();
    const timestamp = String(Math.floor(new Date().getTime() / 1000));
    const rawBody = JSON.stringify({ id: eventId, type: payload.type, companyId: payload.companyId, ticker: payload.ticker, data: payload.data });

    for (const sub of subs) {
      const secret = await resolveSecret(String(sub.id));
      if (!secret) continue;
      const { data: del } = await svc.from("iros_event_deliveries").insert({
        company_id: payload.companyId, event_id: eventId, event_type: payload.type,
        callback_url: sub.callback_url, status: "pending", attempts: 0,
      }).select("id").single();

      let ok = false, lastError = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS && !ok; attempt++) {
        const r = await deliver({ callback_url: String(sub.callback_url), secret }, eventId, timestamp, rawBody);
        ok = r.ok; lastError = r.error ?? "";
        if (!ok && attempt < MAX_ATTEMPTS) await new Promise((res) => setTimeout(res, 250 * attempt));
      }
      if (del?.id) {
        await svc.from("iros_event_deliveries").update({
          status: ok ? "delivered" : "failed", attempts: MAX_ATTEMPTS, last_error: lastError.slice(0, 300),
          delivered_at: ok ? new Date().toISOString() : null,
        }).eq("id", del.id);
      }
    }
  } catch (e) {
    console.error("[events] emit failed:", e instanceof Error ? e.message : e);
  }
}

// The signing secret is stored encrypted at rest in a companion column on the
// subscription row (secret_enc). resolveSecret decrypts it. Kept separate so the
// hash (secret_hash) can be used for cheap equality checks without decrypting.
async function resolveSecret(subId: string): Promise<string | null> {
  try {
    const svc = createServiceClient();
    const { data } = await svc.from("iros_event_subscriptions").select("secret_enc").eq("id", subId).maybeSingle();
    if (!data?.secret_enc) return null;
    const { decryptSecret } = await import("./secretbox");
    return decryptSecret(String(data.secret_enc));
  } catch {
    return null;
  }
}

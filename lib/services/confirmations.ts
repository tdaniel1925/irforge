import crypto from "crypto";
import { createServiceClient } from "../supabase/server";
import { ServiceError, type ActorContext } from "./context";

// ── Two-phase execution for sensitive gateway actions ──
// prepare_*: store the EXACT proposed action + a hash of the underlying content;
// return a short-lived confirmation id the caller must present verbatim.
// execute_*: valid only if the claim is unused, unexpired, belongs to the same
// company AND action, and the underlying content hasn't changed since prepare.
// Single-use is enforced by an atomic used_at flip.

const TTL_MS = 10 * 60 * 1000; // 10 minutes

export const contentHash = (parts: unknown[]) =>
  crypto.createHash("sha256").update(parts.map((p) => JSON.stringify(p ?? null)).join("|")).digest("hex");

export async function createConfirmation(ctx: ActorContext, input: {
  action: string;
  params: Record<string, unknown>;
  contentHash: string;
}): Promise<{ confirmationId: string; expiresAt: string }> {
  const svc = createServiceClient();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  const { data, error } = await svc.from("iros_confirmations").insert({
    company_id: ctx.companyId,
    action: input.action,
    params: input.params,
    content_hash: input.contentHash,
    token_id: ctx.authMethod === "integration_token" ? ctx.actorId.replace(/^token:/, "") : null,
    request_id: ctx.requestId,
    expires_at: expiresAt,
  }).select("id").single();
  if (error || !data) throw new ServiceError("invalid", error?.message ?? "Couldn't create the confirmation.");
  return { confirmationId: String(data.id), expiresAt };
}

// Claim (single-use) and validate a confirmation. Throws ServiceError on any
// mismatch; returns the stored params on success.
export async function consumeConfirmation(ctx: ActorContext, input: {
  confirmationId: string;
  action: string;
  currentContentHash: string;
}): Promise<Record<string, unknown>> {
  const svc = createServiceClient();

  // Atomic single-use claim: flip used_at only if currently null. A concurrent
  // second execute finds zero rows and fails.
  const { data: claimed } = await svc
    .from("iros_confirmations")
    .update({ used_at: new Date().toISOString() })
    .eq("id", input.confirmationId)
    .eq("company_id", ctx.companyId)
    .eq("action", input.action)
    .is("used_at", null)
    .select("id, params, content_hash, expires_at");

  const row = claimed?.[0];
  if (!row) throw new ServiceError("invalid", "Confirmation not found, already used, or wrong action — run prepare again.");
  if (new Date(String(row.expires_at)).getTime() < Date.now()) {
    throw new ServiceError("invalid", "Confirmation expired — run prepare again.");
  }
  if (String(row.content_hash) !== input.currentContentHash) {
    throw new ServiceError("conflict", "The underlying content changed since prepare — review and run prepare again.");
  }
  return (row.params as Record<string, unknown>) ?? {};
}

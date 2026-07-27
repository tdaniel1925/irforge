import { createServiceClient } from "../supabase/server";
import type { ActorContext } from "./context";

// Idempotent execution wrapper for side-effectful service operations.
// See supabase/RUN-THIS-idempotency.sql for the claim table.
//
// Semantics:
//   - No key supplied → run the operation directly (UI clicks stay as today).
//   - Key supplied, first time → claim (insert), run, store result, return it.
//   - Key supplied, already done → return the STORED result, replayed=true —
//     the side effect does not run twice.
//   - Key supplied, claim exists but still 'running' → conflict (a concurrent
//     or crashed attempt); caller retries later. Stale 'running' claims older
//     than 15 minutes are treated as crashed and re-claimed.
//
// The claim insert races atomically on the (company_id, operation, idem_key)
// unique constraint — two concurrent calls can't both run the side effect.

const STALE_CLAIM_MS = 15 * 60 * 1000;

export interface IdemResult<T> { result: T; replayed: boolean }

export async function withIdempotency<T>(
  ctx: ActorContext,
  operation: string,
  idemKey: string | null | undefined,
  fn: () => Promise<T>
): Promise<IdemResult<T>> {
  if (!idemKey) return { result: await fn(), replayed: false };
  const key = idemKey.slice(0, 200);
  const svc = createServiceClient();

  // Try to claim. A duplicate key violates the unique constraint → error.
  const { data: claim, error: claimErr } = await svc
    .from("iros_idempotency")
    .insert({ company_id: ctx.companyId, operation, idem_key: key, status: "running", request_id: ctx.requestId })
    .select("id")
    .single();

  if (claimErr || !claim) {
    // Existing claim — company-scoped lookup only.
    const { data: existing } = await svc
      .from("iros_idempotency")
      .select("id, status, result, created_at")
      .eq("company_id", ctx.companyId)
      .eq("operation", operation)
      .eq("idem_key", key)
      .maybeSingle();

    if (existing?.status === "done") {
      return { result: existing.result as T, replayed: true };
    }
    if (existing && Date.now() - new Date(String(existing.created_at)).getTime() > STALE_CLAIM_MS) {
      // Crashed attempt: take over the claim and run.
      await svc.from("iros_idempotency").update({ status: "running", request_id: ctx.requestId, created_at: new Date().toISOString() }).eq("id", existing.id);
      const result = await fn();
      await svc.from("iros_idempotency").update({ status: "done", result: result as never, finished_at: new Date().toISOString() }).eq("id", existing.id);
      return { result, replayed: false };
    }
    // Someone else is mid-flight with this key.
    const err = new Error("This operation is already in progress — retry shortly with the same idempotency key.");
    (err as Error & { code?: string }).code = "conflict";
    throw err;
  }

  try {
    const result = await fn();
    await svc.from("iros_idempotency").update({ status: "done", result: result as never, finished_at: new Date().toISOString() }).eq("id", claim.id);
    return { result, replayed: false };
  } catch (e) {
    // Failed runs release the claim so an honest retry can execute.
    await svc.from("iros_idempotency").delete().eq("id", claim.id);
    throw e;
  }
}

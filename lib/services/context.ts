import crypto from "crypto";
import { getMyCompany, getMyRole } from "../supabase/store";

// ── ActorContext: WHO is acting, on WHICH company, with WHAT authority ──
//
// The canonical service layer (lib/services/*) takes an explicit ActorContext on
// every operation instead of re-deriving auth from cookies deep inside data
// functions. Two things this enables:
//   1. A future integration gateway (Jordyn) can construct a context from a
//      scoped bearer token — no browser session required — and reuse the exact
//      same service code with the same gates.
//   2. Every query in the service layer is EXPLICITLY scoped to ctx.companyId,
//      so authorization never silently rides on RLS or a service-role client.
//
// authMethod is recorded in audit payloads so "a human clicked this in the UI"
// and "an integration token did this" stay distinguishable after the fact.

export type AuthMethod = "session" | "integration_token";

// Fine-grained scopes. Session actors get them derived from role; token actors
// (Phase 3) will carry an explicit grant. Write scopes imply nothing about
// approve/publish — those are separate, deliberately.
export type Scope =
  | "posts:read"
  | "posts:write"      // create/edit drafts
  | "posts:approve"    // record approval decisions
  | "posts:publish";   // schedule/publish approved content

const ADMIN_SCOPES: Scope[] = ["posts:read", "posts:write", "posts:approve", "posts:publish"];
const MEMBER_SCOPES: Scope[] = ["posts:read", "posts:write"];

export interface ActorContext {
  actorId: string;          // auth user id (session) or token subject (Phase 3)
  actorEmail: string;
  companyId: string;        // the ONE company this context may touch
  role: "admin" | "member";
  scopes: Scope[];
  authMethod: AuthMethod;
  requestId: string;        // correlation id — stamped into every audit record
}

// Typed failure the routes translate to HTTP statuses. Services throw this for
// authorization/validation problems and return domain results for business
// outcomes (e.g. "RED needs counsel" is a result, not an exception).
export class ServiceError extends Error {
  code: "unauthorized" | "forbidden" | "not_found" | "invalid" | "conflict";
  constructor(code: ServiceError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function requireScope(ctx: ActorContext, scope: Scope): void {
  if (!ctx.scopes.includes(scope)) {
    throw new ServiceError("forbidden", `Missing scope ${scope}.`);
  }
}

// Build an ActorContext from the browser session (cookies). Returns null when
// not signed in / no company — callers translate that to a 401.
// getMyCompany() already handles super-admin impersonation; the resolved company
// IS the acting-as company, and role comes back "admin" for super-admins.
export async function resolveSessionActor(requestId?: string): Promise<ActorContext | null> {
  const mine = await getMyCompany();
  if (!mine) return null;
  const role = await getMyRole();
  if (!role) return null;
  const { createServerSupabase } = await import("../supabase/server");
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return {
    actorId: user.id,
    actorEmail: user.email ?? "",
    companyId: mine.id,
    role,
    scopes: role === "admin" ? ADMIN_SCOPES : MEMBER_SCOPES,
    authMethod: "session",
    requestId: requestId ?? crypto.randomUUID(),
  };
}

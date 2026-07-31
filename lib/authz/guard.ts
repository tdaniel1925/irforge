import { NextResponse } from "next/server";
import { getMyCompany, getMyRole } from "../supabase/store";
import { isSuperAdmin } from "../platform";
import { resolveCompanyCapabilities } from "./resolve";
import { can, type Capability } from "./capabilities";

// ── Route-level capability guard ──
// One entry point every protected COMPANY route can call. It resolves the
// session actor + company, computes capabilities from the canonical resolver
// (the same one /api/state uses), and returns either a ready-to-return HTTP
// response (401/403) or the resolved context to proceed with.
//
// Usage in a route:
//   const g = await requireCapability("crm");
//   if (!g.ok) return g.response;
//   // g.companyId, g.role, g.superAdmin available here
//
// This answers CAPABILITY AVAILABILITY (is the feature unlocked for this company).
// Action-level ROLE gating (e.g. only admins may change billing) is a separate,
// explicit check — pass { requireAdmin: true } to fold it in.

export interface GuardOk {
  ok: true;
  companyId: string;
  role: "admin" | "member";
  superAdmin: boolean;
}
export interface GuardFail {
  ok: false;
  response: NextResponse;
}
export type GuardResult = GuardOk | GuardFail;

const deny = (error: string, status: number): GuardFail => ({ ok: false, response: NextResponse.json({ error }, { status }) });

export async function requireCapability(
  capability: Capability,
  opts?: { requireAdmin?: boolean },
): Promise<GuardResult> {
  const mine = await getMyCompany();
  if (!mine) return deny("Sign in.", 401);

  const [role, superAdmin] = await Promise.all([getMyRole(), isSuperAdmin()]);
  const resolvedRole: "admin" | "member" = role === "admin" ? "admin" : "member";

  // Action-level role gate (super-admins always pass).
  if (opts?.requireAdmin && resolvedRole !== "admin" && !superAdmin) {
    return deny("This action requires a company admin.", 403);
  }

  const cap = await resolveCompanyCapabilities(mine.id, mine.company.tier, { knownSuperAdmin: superAdmin });
  if (!can(cap, capability)) {
    return deny("This feature isn't available on your plan.", 403);
  }

  return { ok: true, companyId: mine.id, role: resolvedRole, superAdmin };
}

// Role-only guard for company routes that gate on admin but aren't feature-gated
// (e.g. team management, company settings). Same shape, no capability check.
export async function requireCompanyRole(role: "admin" | "member" = "member"): Promise<GuardResult> {
  const mine = await getMyCompany();
  if (!mine) return deny("Sign in.", 401);
  const [myRole, superAdmin] = await Promise.all([getMyRole(), isSuperAdmin()]);
  const resolvedRole: "admin" | "member" = myRole === "admin" ? "admin" : "member";
  if (role === "admin" && resolvedRole !== "admin" && !superAdmin) {
    return deny("This action requires a company admin.", 403);
  }
  return { ok: true, companyId: mine.id, role: resolvedRole, superAdmin };
}

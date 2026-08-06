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

  // SUSPENSION: a frozen company's members can't do anything server-side. Super-
  // admins are exempt (they manage/lift the suspension, incl. while impersonating).
  if (mine.company.suspended && !superAdmin) {
    return deny("This account is suspended. Contact support.", 403);
  }

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
  if (mine.company.suspended && !superAdmin) {
    return deny("This account is suspended. Contact support.", 403);
  }
  if (role === "admin" && resolvedRole !== "admin" && !superAdmin) {
    return deny("This action requires a company admin.", 403);
  }
  return { ok: true, companyId: mine.id, role: resolvedRole, superAdmin };
}

// Lightweight suspension gate for WRITE routes that resolve the company directly
// via getMyCompany() instead of going through requireCapability/requireCompanyRole
// (the many legacy routes). Call it with the resolved `mine` before mutating.
// Returns null when writable; a ready-to-return 403 when the company is frozen.
// Super-admins (incl. impersonating) are never blocked. Reads should NOT call this
// — a suspended company's own read-only pages still render; we only freeze writes.
export async function assertCompanyWritable(
  mine: { company: { suspended?: boolean } } | null,
): Promise<NextResponse | null> {
  if (mine?.company.suspended && !(await isSuperAdmin())) {
    return NextResponse.json({ error: "This account is suspended. Contact support." }, { status: 403 });
  }
  return null;
}

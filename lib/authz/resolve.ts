import { isSuperAdmin, isCompedCompany, getCompanyFeatures } from "../platform";
import { resolveCapabilities, can, type CapabilityResult, type Capability } from "./capabilities";

// Session-facing wrapper: gather the raw inputs (tier, super-admin, comped, IROS
// flags) and run them through the pure resolveCapabilities() core. Everything
// that needs "what can this company do" — /api/state, server capability guards —
// calls THIS, so there is exactly one place the inputs are combined.

export async function resolveCompanyCapabilities(
  companyId: string,
  tier: string | undefined,
  opts?: { knownSuperAdmin?: boolean },
): Promise<CapabilityResult> {
  const [superAdmin, comped, irosFlags] = await Promise.all([
    opts?.knownSuperAdmin !== undefined ? Promise.resolve(opts.knownSuperAdmin) : isSuperAdmin(),
    isCompedCompany(companyId),
    getCompanyFeatures(companyId),
  ]);
  return resolveCapabilities({ tier, superAdmin, comped, irosFlags });
}

// Server guard: throw-free check a route can use. Returns whether the capability
// is available for the company. (Action-level role/scope gating stays in the
// service layer via requireScope; this answers capability AVAILABILITY.)
export async function companyCan(
  companyId: string,
  tier: string | undefined,
  capability: Capability,
  opts?: { knownSuperAdmin?: boolean },
): Promise<boolean> {
  const result = await resolveCompanyCapabilities(companyId, tier, opts);
  return can(result, capability);
}

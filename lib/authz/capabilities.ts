import type { Tier, Feature } from "../billing";
import { TIERS } from "../billing";
import type { FeatureKey } from "../platform";
import { IROS_FEATURES } from "../platform";

// ── Canonical capability resolver ──
// THE single source of truth for "what can this company/actor do", reconciling
// the three overlapping vocabularies the app grew (tier features, per-company
// IROS flags, and — enforced separately — actor scopes).
//
// The felt bug this fixes: /api/state used to REWRITE a comped company's tier to
// "pro" and the browser recomputed access from tier, while server routes checked
// flags independently — so client and server disagreed. Both sides now read the
// map this file computes, from the SAME inputs.
//
// ── Precedence (documented rule; decided from how comps + IROS flags are used) ──
//   1. super-admin  → every capability (platform override)
//   2. comped       → every capability (free full access; same as top tier + all flags)
//   3. tier grants  → a capability if the plan's tier includes it
//   4. IROS flag ON → a capability (manual per-company GRANT — UNION with tier,
//                     because the flag toggle exists to grant beyond tier, e.g.
//                     turning "social" on for a company that hasn't paid for it)
//   5. otherwise    → denied
//
//   Actor ROLE + SCOPE gate the specific ACTION on top of capability availability
//   (a member may see CRM but not approve/publish) — that stays in requireScope /
//   the service layer; this file answers "is the CAPABILITY available at all".

// The union capability namespace: every tier Feature plus every IROS flag key.
// They overlap loosely (calendar in both; publishing≈publishX; social≈studio) but
// are kept as-is here — unifying the vocabularies is a later normalization; the
// job now is one CONSISTENT map, not a renamed one.
export type Capability = Feature | FeatureKey;

export interface CapabilityInput {
  tier: Tier | string | null | undefined;
  superAdmin: boolean;
  comped: boolean;
  irosFlags: Record<string, boolean>;   // company_features map (FeatureKey → enabled)
}

export interface CapabilityResult {
  fullAccess: boolean;                   // super-admin or comped
  comped: boolean;
  tier: Tier;
  // Effective availability per capability. tierFeatures ∪ irosFlags, unless
  // fullAccess (all true).
  capabilities: Record<string, boolean>;
}

const ALL_TIER_FEATURES: Feature[] = Array.from(new Set(Object.values(TIERS).flatMap((t) => t.features)));
const ALL_IROS_KEYS: FeatureKey[] = IROS_FEATURES.map((f) => f.key);
export const ALL_CAPABILITIES: string[] = Array.from(new Set<string>([...ALL_TIER_FEATURES, ...ALL_IROS_KEYS]));

// The PURE core — no I/O. Given the resolved inputs, produce the effective map.
// This is what tests pin and what both client and server ultimately consume.
export function resolveCapabilities(input: CapabilityInput): CapabilityResult {
  const candidate = (input.tier ?? "free") as Tier;
  const tier: Tier = candidate in TIERS ? candidate : "free";
  const fullAccess = input.superAdmin || input.comped;

  const caps: Record<string, boolean> = {};
  if (fullAccess) {
    for (const c of ALL_CAPABILITIES) caps[c] = true;
    return { fullAccess, comped: input.comped, tier, capabilities: caps };
  }

  const tierFeatures = new Set(TIERS[tier]?.features ?? []);
  for (const c of ALL_CAPABILITIES) {
    // UNION: available if the tier includes it OR an IROS flag grants it.
    caps[c] = tierFeatures.has(c as Feature) || input.irosFlags[c] === true;
  }
  return { fullAccess, comped: input.comped, tier, capabilities: caps };
}

// Convenience: is one capability available given a computed result?
export function can(result: CapabilityResult, capability: Capability): boolean {
  return result.fullAccess || result.capabilities[capability] === true;
}

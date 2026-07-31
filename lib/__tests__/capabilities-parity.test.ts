import { describe, it, expect } from "vitest";
import { resolveCapabilities, can, ALL_CAPABILITIES, type CapabilityInput, type Capability } from "../authz/capabilities";
import { tierHasFeature, type Feature, type Tier } from "../billing";

// Parity: the map /api/state sends to the client and the answer a server guard
// computes both come from resolveCapabilities() — so for the SAME inputs they must
// agree. This is the regression guard against the old bug where /api/state faked
// tier:"pro" and FeatureGate recomputed from tier while the server checked flags.

const scenarios: { name: string; input: CapabilityInput }[] = [
  { name: "free, nothing", input: { tier: "free", superAdmin: false, comped: false, irosFlags: {} } },
  { name: "board tier", input: { tier: "board", superAdmin: false, comped: false, irosFlags: {} } },
  { name: "growth tier", input: { tier: "growth", superAdmin: false, comped: false, irosFlags: {} } },
  { name: "pro tier", input: { tier: "pro", superAdmin: false, comped: false, irosFlags: {} } },
  { name: "comped free company", input: { tier: "free", superAdmin: false, comped: true, irosFlags: {} } },
  { name: "super-admin on free", input: { tier: "free", superAdmin: true, comped: false, irosFlags: {} } },
  { name: "free + social flag granted", input: { tier: "free", superAdmin: false, comped: false, irosFlags: { social: true } } },
];

describe("client/server capability parity", () => {
  for (const s of scenarios) {
    it(`server can() matches the client capability map — ${s.name}`, () => {
      const result = resolveCapabilities(s.input);
      // "client" reads result.capabilities[x]; "server" calls can(result, x).
      // They must agree for every capability.
      for (const c of ALL_CAPABILITIES as Capability[]) {
        const clientSees = result.fullAccess || result.capabilities[c] === true;
        const serverAllows = can(result, c);
        expect(serverAllows).toBe(clientSees);
      }
    });
  }

  it("a NON-full-access tier's map equals plain tierHasFeature for tier features", () => {
    // For an ordinary paid tier with no flags/overrides, the canonical map must not
    // diverge from the simple tier check — proving we didn't change tier semantics.
    for (const tier of ["free", "board", "starter", "growth", "pro"] as Tier[]) {
      const result = resolveCapabilities({ tier, superAdmin: false, comped: false, irosFlags: {} });
      const tierFeatures: Feature[] = ["page", "board", "qa", "publishX", "approvals", "crm", "calendar", "analyzer", "shortdefense"];
      for (const f of tierFeatures) {
        expect(result.capabilities[f]).toBe(tierHasFeature(tier, f));
      }
    }
  });
});

import { describe, it, expect } from "vitest";
import { resolveCapabilities, can, ALL_CAPABILITIES } from "../authz/capabilities";

const noFlags = {} as Record<string, boolean>;

describe("resolveCapabilities — precedence", () => {
  it("super-admin gets every capability regardless of tier/flags", () => {
    const r = resolveCapabilities({ tier: "free", superAdmin: true, comped: false, irosFlags: noFlags });
    expect(r.fullAccess).toBe(true);
    for (const c of ALL_CAPABILITIES) expect(r.capabilities[c]).toBe(true);
  });

  it("comped company gets every capability (free tier, no flags)", () => {
    const r = resolveCapabilities({ tier: "free", superAdmin: false, comped: true, irosFlags: noFlags });
    expect(r.fullAccess).toBe(true);
    expect(can(r, "publishing")).toBe(true);
    expect(can(r, "crm")).toBe(true);
  });

  it("tier grants its own features and nothing above", () => {
    const r = resolveCapabilities({ tier: "board", superAdmin: false, comped: false, irosFlags: noFlags });
    expect(r.capabilities["board"]).toBe(true);   // board tier
    expect(r.capabilities["qa"]).toBe(true);       // board tier
    expect(r.capabilities["crm"]).toBe(false);     // growth-only
    expect(r.capabilities["publishX"]).toBe(false); // starter-only
  });

  it("SEAM 2 — an IROS flag GRANTS a capability beyond the tier (union)", () => {
    // free tier, but an admin turned the "social" flag ON → available.
    const r = resolveCapabilities({ tier: "free", superAdmin: false, comped: false, irosFlags: { social: true } });
    expect(r.capabilities["social"]).toBe(true);
    // other flags/features stay locked
    expect(r.capabilities["publishing"]).toBe(false);
    expect(r.capabilities["crm"]).toBe(false);
  });

  it("a flag OFF does not remove a capability the TIER already grants (union, not intersection)", () => {
    // growth tier includes crm; an absent/false crm-ish flag must not take it away.
    const r = resolveCapabilities({ tier: "growth", superAdmin: false, comped: false, irosFlags: { calendar: false } });
    expect(r.capabilities["crm"]).toBe(true);       // from tier
    expect(r.capabilities["calendar"]).toBe(true);  // growth tier includes calendar; flag false doesn't strip it
  });

  it("unknown/empty tier falls back to free", () => {
    const r = resolveCapabilities({ tier: undefined, superAdmin: false, comped: false, irosFlags: noFlags });
    expect(r.tier).toBe("free");
    expect(r.capabilities["page"]).toBe(true);   // free includes page
    expect(r.capabilities["board"]).toBe(false);
  });

  it("pro tier unlocks the top features without any flags", () => {
    const r = resolveCapabilities({ tier: "pro", superAdmin: false, comped: false, irosFlags: noFlags });
    expect(r.capabilities["analyzer"]).toBe(true);
    expect(r.capabilities["shortdefense"]).toBe(true);
    expect(r.capabilities["crm"]).toBe(true);
  });

  it("can() honors fullAccess even for a capability not in the map", () => {
    const full = resolveCapabilities({ tier: "free", superAdmin: true, comped: false, irosFlags: noFlags });
    expect(can(full, "captable")).toBe(true);
  });
});

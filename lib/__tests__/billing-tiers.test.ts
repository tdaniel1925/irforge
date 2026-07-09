import { describe, expect, it } from "vitest";
import { TIERS, TIER_ORDER, FEATURE_MIN_TIER, tierHasFeature, isPaid, type Feature, type Tier } from "../billing";

// The tier ladder's structural guarantees. If a future edit breaks any of these,
// gating gets confusing (upgrades losing features, upsell text naming the wrong
// tier, checkout selling features the tier doesn't grant).

describe("tier ladder consistency", () => {
  it("every tier is a strict superset of the tier below it", () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const lower = TIERS[TIER_ORDER[i - 1]].features;
      const higher = new Set(TIERS[TIER_ORDER[i]].features);
      for (const f of lower) {
        expect(higher.has(f), `${TIER_ORDER[i]} must include everything ${TIER_ORDER[i - 1]} has (missing: ${f})`).toBe(true);
      }
      expect(higher.size, `${TIER_ORDER[i]} must add something over ${TIER_ORDER[i - 1]}`).toBeGreaterThan(lower.length);
    }
  });

  it("TIER_ORDER covers exactly the tiers in TIERS", () => {
    expect([...TIER_ORDER].sort()).toEqual(Object.keys(TIERS).sort());
  });

  it("FEATURE_MIN_TIER agrees with TIERS: a feature is present iff tier >= its min tier", () => {
    const rank = (t: Tier) => TIER_ORDER.indexOf(t);
    for (const [feature, minTier] of Object.entries(FEATURE_MIN_TIER) as [Feature, Tier][]) {
      for (const tier of TIER_ORDER) {
        const expected = rank(tier) >= rank(minTier);
        expect(
          tierHasFeature(tier, feature),
          `${tier} / ${feature}: FEATURE_MIN_TIER says min=${minTier} but TIERS disagrees`
        ).toBe(expected);
      }
    }
  });

  it("every feature in every tier has a FEATURE_MIN_TIER entry", () => {
    for (const tier of TIER_ORDER) {
      for (const f of TIERS[tier].features) {
        expect(FEATURE_MIN_TIER[f], `feature ${f} (in ${tier}) missing from FEATURE_MIN_TIER`).toBeDefined();
      }
    }
  });

  it("prices strictly increase up the ladder", () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      expect(TIERS[TIER_ORDER[i]].price).toBeGreaterThan(TIERS[TIER_ORDER[i - 1]].price);
    }
  });

  it("isPaid: only free is unpaid", () => {
    expect(isPaid("free")).toBe(false);
    for (const t of TIER_ORDER.slice(1)) expect(isPaid(t)).toBe(true);
  });

  it("board tier gates correctly: qa/board yes, publishing no", () => {
    expect(tierHasFeature("board", "qa")).toBe(true);
    expect(tierHasFeature("board", "board")).toBe(true);
    expect(tierHasFeature("board", "publishX")).toBe(false);
    expect(tierHasFeature("free", "qa")).toBe(false);
  });
});

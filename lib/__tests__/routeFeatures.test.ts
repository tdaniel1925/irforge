import { describe, it, expect } from "vitest";
import { featureForPath } from "../routeFeatures";

describe("featureForPath — paid page gating by prefix", () => {
  it("gates the exact mapped routes", () => {
    expect(featureForPath("/crm")).toBe("crm");
    expect(featureForPath("/studio")).toBe("studio");
    expect(featureForPath("/calendar")).toBe("calendar");
    expect(featureForPath("/captable")).toBe("captable");
    expect(featureForPath("/analyzer")).toBe("analyzer");
  });

  it("NESTED paid subroutes inherit their parent's gate (the hole this fixes)", () => {
    expect(featureForPath("/crm/import")).toBe("crm");           // was ungated
    expect(featureForPath("/social")).toBe("studio");            // whole social engine
    expect(featureForPath("/social/quickpost")).toBe("studio");  // was ungated
    expect(featureForPath("/social/calendar")).toBe("studio");
    expect(featureForPath("/social/outbox")).toBe("studio");
    expect(featureForPath("/social/review")).toBe("studio");
    expect(featureForPath("/social/setup")).toBe("studio");
  });

  it("whole-segment match — a mapped prefix never leaks to a similarly-named route", () => {
    // "/crm" must NOT gate "/crm-export" or "/crmx"
    expect(featureForPath("/crm-export")).toBeUndefined();
    expect(featureForPath("/crmx")).toBeUndefined();
    expect(featureForPath("/companyx")).toBeUndefined(); // "/company" is threats-gated
  });

  it("unmapped routes are ungated (settings/billing/admin/onboarding reachable when logged in)", () => {
    expect(featureForPath("/settings")).toBeUndefined();
    expect(featureForPath("/billing")).toBeUndefined();
    expect(featureForPath("/admin")).toBeUndefined();
    expect(featureForPath("/onboarding")).toBeUndefined();
    expect(featureForPath("/team")).toBeUndefined();
  });

  it("approvals family maps consistently", () => {
    expect(featureForPath("/app")).toBe("approvals");
    expect(featureForPath("/filings")).toBe("approvals");
    expect(featureForPath("/mentions")).toBe("approvals");
  });
});

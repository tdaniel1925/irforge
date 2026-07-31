import { describe, it, expect } from "vitest";
import { classifyCompany } from "../customerClassify";

describe("classifyCompany", () => {
  it("comped company (AMFN) is a customer", () => {
    expect(classifyCompany({ name: "American Fusion", ticker: "AMFN", comped: true, subscriptionStatus: "active", onboardingComplete: true, postsTotal: 115 })).toBe("customer");
  });
  it("active paid subscription is a customer", () => {
    expect(classifyCompany({ name: "Paid Co", ticker: "PAID", subscriptionStatus: "active", comped: false })).toBe("customer");
  });
  it("past_due is still a customer (they were paying)", () => {
    expect(classifyCompany({ name: "Late Co", subscriptionStatus: "past_due" })).toBe("customer");
  });

  it("the phantom team-member rows (unnamed, none/free, 0 posts) are phantoms", () => {
    // These are the fd@/bn@/jd@/socials@ rows from the screenshot.
    expect(classifyCompany({ name: "", ticker: "", subscriptionStatus: "none", comped: false, onboardingComplete: false, postsTotal: 0 })).toBe("phantom");
  });
  it("null/empty everything is a phantom", () => {
    expect(classifyCompany({})).toBe("phantom");
    expect(classifyCompany({ name: null, ticker: null, subscriptionStatus: null, comped: null, postsTotal: null })).toBe("phantom");
  });

  it("onboarded-but-unpaid company is a prospect, not a customer", () => {
    expect(classifyCompany({ name: "Free Co", ticker: "FREE", subscriptionStatus: "none", comped: false, onboardingComplete: true })).toBe("prospect");
  });
  it("has a ticker but no payment → prospect", () => {
    expect(classifyCompany({ name: "", ticker: "BQST", subscriptionStatus: "none" })).toBe("prospect");
  });
  it("has posted content but no payment → prospect (real activity, not a phantom)", () => {
    expect(classifyCompany({ name: "", ticker: "", subscriptionStatus: "none", postsTotal: 26 })).toBe("prospect");
  });

  it("payment wins over emptiness — a comped shell is still a customer", () => {
    expect(classifyCompany({ name: "", ticker: "", comped: true, postsTotal: 0 })).toBe("customer");
  });
});

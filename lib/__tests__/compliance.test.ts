import { describe, it, expect } from "vitest";
import {
  checkContent,
  hasBlockingFlags,
  publishGate,
  buildChannelPost,
  buildPublishedThread,
  CHANNEL_LIMITS,
} from "@/lib/compliance";
import type { Company } from "@/lib/types";

// The compliance layer is the product's core promise — these tests pin the gates so
// they can't silently regress. All pure functions; no mocking.

const company = {
  name: "American Fusion, Inc.",
  ticker: "AMFN",
  flsText: "This post may contain forward-looking statements. Actual results may differ materially. See our SEC filings at sec.gov.",
  disclosureText: "Posted via PubcoZone, a compensated service provider. Not investment advice.",
} as unknown as Company;

describe("checkContent — blocked language", () => {
  it.each([
    ["price prediction", "This stock is going to the moon"],
    ["price target", "My price target is high"],
    ["valuation claim", "AMFN is deeply under-valued right now"],
    ["investment advice", "Buy now before it's too late"],
    ["advice: load up", "Time to load up on shares"],
    ["guarantee", "This is a guaranteed winner"],
    ["no-risk", "A risk-free opportunity"],
  ])("blocks %s", (_label, text) => {
    expect(hasBlockingFlags(checkContent([text]))).toBe(true);
  });

  it.each([
    ["a routine factual post", "We filed our 10-Q today. Read it at sec.gov."],
    ["a neutral update", "Our team attended the industry conference this week."],
  ])("does not block %s", (_label, text) => {
    expect(hasBlockingFlags(checkContent([text]))).toBe(false);
  });

  it("flags possible MNPI as warn (not block)", () => {
    const flags = checkContent(["Big news coming next week — stay tuned!"]);
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((f) => f.severity === "warn")).toBe(true);
    expect(hasBlockingFlags(flags)).toBe(false);
  });

  it("catches letter-spacing evasion (m o o n)", () => {
    expect(hasBlockingFlags(checkContent(["we're going to the m o o n"]))).toBe(true);
  });

  it("catches zero-width-space evasion", () => {
    expect(hasBlockingFlags(checkContent(["guar​anteed returns"]))).toBe(true);
  });

  it("does not false-positive on hyphenated words like 10-Q", () => {
    expect(checkContent(["Our 10-Q covers the quarter."]).filter((f) => f.severity === "block")).toHaveLength(0);
  });
});

describe("publishGate — the mandatory publish matrix", () => {
  it("blocks when quiet mode is on, regardless of everything else", () => {
    expect(publishGate({ status: "approved", flags: [], quietMode: true }).ok).toBe(false);
  });
  it("blocks anything not human-approved", () => {
    for (const status of ["draft", "reviewed", "pending", "scheduled-x", ""]) {
      expect(publishGate({ status, flags: [], quietMode: false }).ok).toBe(false);
    }
  });
  it("blocks approved drafts that still carry blocking flags", () => {
    const flags = checkContent(["guaranteed 10x — buy now"]);
    expect(publishGate({ status: "approved", flags, quietMode: false }).ok).toBe(false);
  });
  it("passes an approved, clean, non-quiet draft", () => {
    expect(publishGate({ status: "approved", flags: [], quietMode: false }).ok).toBe(true);
  });
  it("warn-only flags do not block publishing", () => {
    const flags = checkContent(["Exciting update coming soon"]);
    expect(hasBlockingFlags(flags)).toBe(false);
    expect(publishGate({ status: "approved", flags, quietMode: false }).ok).toBe(true);
  });
});

describe("buildChannelPost — mandatory disclosures per channel", () => {
  it("appends the full FLS note on non-X channels", () => {
    const out = buildChannelPost("Hello investors.", company, "linkedin");
    expect(out).toContain("Hello investors.");
    expect(out).toContain(company.flsText);
  });

  it("uses the compact FLS + ticker link on X and stays within 280", () => {
    const out = buildChannelPost("Short update.", company, "twitter");
    expect(out).toContain("pubcozone.com/t/AMFN");
    expect(out.length).toBeLessThanOrEqual(CHANNEL_LIMITS.twitter);
  });

  it("never returns an over-limit X post WITH a partial note — body-only when the note can't fit", () => {
    const body = "x".repeat(275); // note can't fit
    const out = buildChannelPost(body, company, "twitter");
    expect(out).toBe(body); // unchanged body; the route's length guard reports it
  });

  it("thread form carries BOTH notices as separate tweets", () => {
    const thread = buildPublishedThread(["one", "two"], company);
    expect(thread).toHaveLength(4);
    expect(thread[2]).toBe(company.flsText);
    expect(thread[3]).toBe(company.disclosureText);
  });
});

describe("CHANNEL_LIMITS — sanity", () => {
  it("X is 280 and every channel has a positive limit", () => {
    expect(CHANNEL_LIMITS.twitter).toBe(280);
    for (const v of Object.values(CHANNEL_LIMITS)) expect(v).toBeGreaterThan(0);
  });
});

import { describe, it, expect } from "vitest";
import { canTransition } from "@/lib/iros";

// The post state machine. Illegal moves must be rejected server-side — the review
// found the machine enforced in only one route, so at minimum pin its shape here.

describe("canTransition — allowed moves", () => {
  it.each([
    ["draft", "reviewed"],
    ["reviewed", "approved"],
    ["reviewed", "draft"],
    ["approved", "scheduled"],
    ["approved", "published"],
    ["scheduled", "published"],
    ["published", "pulled"],
    ["pulled", "draft"],
  ])("%s -> %s is allowed", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
});

describe("canTransition — illegal moves rejected", () => {
  it.each([
    ["draft", "approved"],   // skipping review
    ["draft", "published"],  // skipping everything
    ["reviewed", "published"],
    ["published", "draft"],  // published content can't quietly become editable
    ["pulled", "published"], // pulled content can't republish directly
    ["nonsense", "draft"],
    ["draft", "nonsense"],
  ])("%s -> %s is rejected", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe("'pending' is not an iros_posts state", () => {
  // Regression pin: the daily-suggestions cron wrote status 'pending' (legacy
  // JSON-drafts vocabulary) into iros_posts — no view read it, so the rows were
  // invisible. The insert now uses 'draft'; the DB constrains the column
  // (RUN-THIS-post-status-canon.sql). Keep 'pending' out of the state machine.
  it.each([["pending", "draft"], ["pending", "approved"], ["draft", "pending"], ["approved", "pending"]])(
    "%s -> %s is rejected", (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    }
  );
});

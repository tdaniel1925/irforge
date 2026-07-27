import { describe, it, expect } from "vitest";
import { rateAllow } from "../publicStats";

// Without Supabase env, rateAllow uses its in-memory window buckets — the same
// counting logic the DB rpc implements. Verifies the allow/deny boundary that
// the public AI endpoints (board/radar, truth-check) depend on.
describe("rateAllow — window bucket boundary", () => {
  it("allows up to the limit then denies within one window", async () => {
    const key = `test:${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 5; i++) expect(await rateAllow(key, 5)).toBe(true);
    expect(await rateAllow(key, 5)).toBe(false);
    expect(await rateAllow(key, 5)).toBe(false);
  });

  it("keys are independent — one hot key doesn't throttle another", async () => {
    const a = `test:${Math.random().toString(36).slice(2)}`;
    const b = `test:${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 3; i++) await rateAllow(a, 3);
    expect(await rateAllow(a, 3)).toBe(false);
    expect(await rateAllow(b, 3)).toBe(true);
  });
});

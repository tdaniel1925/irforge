import { describe, it, expect } from "vitest";
import { summarizeEmail } from "../emailMetrics";

describe("summarizeEmail", () => {
  it("the real-world broken-webhook case (645 sent / 3 delivered / 56 failed) reads honestly", () => {
    const s = summarizeEmail({ sent: 645, delivered: 3, bounced: 56 });
    expect(s.sent).toBe(645);
    expect(s.delivered).toBe(3);
    expect(s.failed).toBe(56);
    // the 586 unexplained are surfaced as pending, not hidden
    expect(s.pending).toBe(586);
    // delivery rate is over CONFIRMED events (3 of 59), not sent — ~5%
    expect(s.deliveryRate).toBe(Math.round((3 / 59) * 100));
    // we only heard back on 9% of sends → webhook health warning
    expect(s.resolvedRate).toBe(Math.round((59 / 645) * 100));
    expect(s.health).toBe("warn");
  });

  it("healthy delivery reports ok", () => {
    const s = summarizeEmail({ sent: 100, delivered: 95, bounced: 5 });
    expect(s.pending).toBe(0);
    expect(s.deliveryRate).toBe(95);
    expect(s.resolvedRate).toBe(100);
    expect(s.health).toBe("ok");
  });

  it("counts opened/clicked as delivered and complained as failed", () => {
    const s = summarizeEmail({ sent: 10, delivered: 4, opened: 3, clicked: 1, complained: 2 });
    expect(s.delivered).toBe(8);   // delivered + opened + clicked
    expect(s.failed).toBe(2);      // complained
  });

  it("no events → all zero, null rates, ok", () => {
    const s = summarizeEmail({});
    expect(s.sent).toBe(0);
    expect(s.deliveryRate).toBeNull();
    expect(s.resolvedRate).toBeNull();
    expect(s.health).toBe("ok");
  });

  it("sent with zero confirmations → unknown health (webhook likely dead)", () => {
    const s = summarizeEmail({ sent: 30 });
    expect(s.resolvedRate).toBe(0);
    expect(s.health).toBe("warn"); // 0% < 25% threshold with volume ≥ 20
  });

  it("falls back to summing statuses when no explicit 'sent' present", () => {
    const s = summarizeEmail({ delivered: 8, bounced: 2 });
    expect(s.sent).toBe(10);       // sum fallback
    expect(s.pending).toBe(0);
  });
});

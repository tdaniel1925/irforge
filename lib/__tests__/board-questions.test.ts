import { describe, it, expect } from "vitest";
import { toQuestions } from "@/lib/board";

// "Answered" = a question with at least one VERIFIED (company) reply. The badge,
// the digest email, and the Q&A inbox all hang off this one definition.

const row = (o: Partial<Record<string, unknown>>) => ({
  id: "q1", author: "inv", body: "?", created_at: "2026-07-01T00:00:00Z",
  verified: false, flag: "question", parent_id: null, ...o,
});

describe("toQuestions — answered detection", () => {
  it("a question with no replies is open", () => {
    const qs = toQuestions([row({})]);
    expect(qs).toHaveLength(1);
    expect(qs[0].answered).toBe(false);
  });

  it("an unverified (investor) reply does NOT answer it", () => {
    const qs = toQuestions([
      row({}),
      row({ id: "r1", flag: "chatter", parent_id: "q1", verified: false }),
    ]);
    expect(qs[0].answered).toBe(false);
    expect(qs[0].replyCount).toBe(1);
  });

  it("a verified company reply answers it", () => {
    const qs = toQuestions([
      row({}),
      row({ id: "r1", flag: "verified", parent_id: "q1", verified: true }),
    ]);
    expect(qs[0].answered).toBe(true);
  });

  it("non-question posts and replies are not listed as questions", () => {
    const qs = toQuestions([
      row({ id: "c1", flag: "chatter" }),
      row({ id: "r1", flag: "question", parent_id: "c1" }), // a reply, even if flagged question
    ]);
    expect(qs).toHaveLength(0);
  });

  it("multiple questions track answers independently", () => {
    const qs = toQuestions([
      row({ id: "q1" }),
      row({ id: "q2" }),
      row({ id: "r1", parent_id: "q2", verified: true, flag: "verified" }),
    ]);
    const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
    expect(byId.q1.answered).toBe(false);
    expect(byId.q2.answered).toBe(true);
  });
});

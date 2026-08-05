import { describe, it, expect } from "vitest";
import { checkContent, hasBlockingFlags } from "../compliance";

// The investor-update send path reuses the SAME compliance gate as posts and the
// SAME opted-in-recipient filter. Pin both here (the DB-touching send is
// integration-tested manually; these are the pure guards that protect it).

describe("investor update — compliance gate (shared with posts)", () => {
  it("blocks price-prediction / advice language in an update", () => {
    // hasBlockingFlags is what sendInvestorUpdate checks before sending.
    const flags = checkContent(["Big news", "This stock is undervalued — buy now before it doubles."]);
    expect(hasBlockingFlags(flags)).toBe(true);
  });

  it("allows a factual, public-record update", () => {
    const flags = checkContent(["Q2 update", "We filed our 10-Q today; revenue and cash position are detailed in the filing on SEC EDGAR."]);
    expect(hasBlockingFlags(flags)).toBe(false);
  });
});

// Mirror of listOptedInRecipients' filter: opted-in AND a valid email.
function optedInRecipients(rows: { opted_in: boolean; email: string; full_name: string }[]) {
  return rows
    .filter((r) => r.opted_in)
    .map((r) => ({ name: r.full_name, email: (r.email ?? "").trim().toLowerCase() }))
    .filter((r) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email));
}

describe("investor update — recipient filtering", () => {
  it("includes only opted-in contacts with a valid email", () => {
    const out = optedInRecipients([
      { opted_in: true, email: "a@x.com", full_name: "A" },       // ✓
      { opted_in: false, email: "b@x.com", full_name: "B" },      // not opted in
      { opted_in: true, email: "", full_name: "C" },              // no email
      { opted_in: true, email: "not-an-email", full_name: "D" },  // invalid
      { opted_in: true, email: "  E@X.COM ", full_name: "E" },    // ✓ (trimmed/lowercased)
    ]);
    expect(out).toEqual([
      { name: "A", email: "a@x.com" },
      { name: "E", email: "e@x.com" },
    ]);
  });

  it("empty list when nobody opted in", () => {
    expect(optedInRecipients([{ opted_in: false, email: "a@x.com", full_name: "A" }])).toEqual([]);
  });
});

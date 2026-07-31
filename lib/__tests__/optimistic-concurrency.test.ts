import { describe, it, expect } from "vitest";

// Pure model of the optimistic-concurrency guard used in loadCompanyDb().save().
// The real code does a version-checked UPDATE; here we simulate the exact rule
// against an in-memory "row" so the lost-update protection is pinned without a DB.
//
//   write(payload, loadedVersion):
//     if row.version !== loadedVersion  -> STALE (reject; caller reloads)
//     else                              -> row.data = payload; row.version += 1

class Row { version = 0; data: unknown = null; }

function guardedWrite(row: Row, payload: unknown, loadedVersion: number): "ok" | "stale" {
  if (row.version !== loadedVersion) return "stale";
  row.data = payload;
  row.version += 1;
  return "ok";
}

describe("optimistic concurrency — company_data version guard", () => {
  it("a write with the current version succeeds and bumps the version", () => {
    const row = new Row(); // version 0
    expect(guardedWrite(row, ["a"], 0)).toBe("ok");
    expect(row.version).toBe(1);
    expect(row.data).toEqual(["a"]);
  });

  it("TWO teammates who both loaded v0: the first wins, the second is rejected (no lost update)", () => {
    const row = new Row(); // both load version 0
    const aLoaded = 0, bLoaded = 0;

    // Teammate A saves first.
    expect(guardedWrite(row, ["A's change"], aLoaded)).toBe("ok");
    expect(row.version).toBe(1);

    // Teammate B saves against the STALE version 0 → rejected. A's change survives.
    expect(guardedWrite(row, ["B's change"], bLoaded)).toBe("stale");
    expect(row.data).toEqual(["A's change"]);  // NOT clobbered
    expect(row.version).toBe(1);
  });

  it("after a stale rejection, reloading and retrying succeeds", () => {
    const row = new Row();
    guardedWrite(row, ["first"], 0);           // version -> 1
    expect(guardedWrite(row, ["stale retry"], 0)).toBe("stale");
    // B reloads (sees version 1) and retries against the fresh version:
    expect(guardedWrite(row, ["B after reload"], 1)).toBe("ok");
    expect(row.version).toBe(2);
    expect(row.data).toEqual(["B after reload"]);
  });

  it("sequential writes from the same loader each bump and stay consistent", () => {
    const row = new Row();
    let v = 0;
    for (let i = 0; i < 5; i++) {
      expect(guardedWrite(row, [`edit ${i}`], v)).toBe("ok");
      v += 1;
    }
    expect(row.version).toBe(5);
    expect(row.data).toEqual(["edit 4"]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ONLY isSuperAdmin so assertCompanyWritable's check is controllable, while
// keeping the rest of platform intact (guard.ts pulls IROS_FEATURES transitively).
const isSuperAdmin = vi.fn<[], Promise<boolean>>();
vi.mock("../platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../platform")>()),
  isSuperAdmin: () => isSuperAdmin(),
}));

import { assertCompanyWritable } from "../authz/guard";

beforeEach(() => {
  isSuperAdmin.mockReset();
});

describe("assertCompanyWritable — server-side suspension backstop", () => {
  it("returns null (writable) for a non-suspended company", async () => {
    isSuperAdmin.mockResolvedValue(false);
    const r = await assertCompanyWritable({ company: { suspended: false } });
    expect(r).toBeNull();
  });

  it("returns null when the flag is absent (default writable)", async () => {
    isSuperAdmin.mockResolvedValue(false);
    const r = await assertCompanyWritable({ company: {} });
    expect(r).toBeNull();
  });

  it("returns a 403 for a suspended company (ordinary user)", async () => {
    isSuperAdmin.mockResolvedValue(false);
    const r = await assertCompanyWritable({ company: { suspended: true } });
    expect(r).not.toBeNull();
    expect(r!.status).toBe(403);
    const body = await r!.json();
    expect(body.error).toMatch(/suspended/i);
  });

  it("exempts super-admins even when the company is suspended", async () => {
    isSuperAdmin.mockResolvedValue(true);
    const r = await assertCompanyWritable({ company: { suspended: true } });
    expect(r).toBeNull();
    // isSuperAdmin is only consulted when the company is actually suspended.
    expect(isSuperAdmin).toHaveBeenCalledOnce();
  });

  it("does not consult isSuperAdmin for a writable company (cheap path)", async () => {
    isSuperAdmin.mockResolvedValue(false);
    await assertCompanyWritable({ company: { suspended: false } });
    expect(isSuperAdmin).not.toHaveBeenCalled();
  });

  it("treats a null company as writable (auth handled elsewhere)", async () => {
    const r = await assertCompanyWritable(null);
    expect(r).toBeNull();
  });
});

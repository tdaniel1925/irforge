import { describe, it, expect, vi, beforeEach } from "vitest";

// Reuses the in-memory Supabase engine shape from services-posts.test.ts,
// extended with the .in() / ilike() / is() surface the token + confirmation +
// crm code needs.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
function reset() {
  for (const k of ["companies", "iros_posts", "iros_approvals", "iros_disclosure_events", "iros_integration_tokens", "iros_confirmations", "crm_contacts", "crm_tasks", "crm_activities", "iros_idempotency"]) db[k] = [];
}
let idSeq = 1;
const newId = () => `id-${idSeq++}`;

class Query {
  private rows: Row[]; private table: string;
  private pendingInsert: Row | null = null; private pendingUpdate: Row | null = null; private isDelete = false;
  private filters: Array<(r: Row) => boolean> = []; private limitN: number | null = null;
  constructor(table: string) { this.table = table; this.rows = db[table] ?? (db[table] = []); }
  select() { return this; }
  insert(row: Row) { this.pendingInsert = row; return this; }
  update(patch: Row) { this.pendingUpdate = patch; return this; }
  delete() { this.isDelete = true; return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  is(c: string, v: null) { this.filters.push((r) => r[c] == null && v === null); return this; }
  in(c: string, vals: unknown[]) { this.filters.push((r) => vals.includes(r[c])); return this; }
  not(c: string, op: string, v: unknown) { if (op === "is" && v === null) this.filters.push((r) => r[c] != null); return this; }
  lte(c: string, v: string) { this.filters.push((r) => String(r[c] ?? "") <= v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c] ?? "") >= v); return this; }
  ilike(c: string, pat: string) { const needle = pat.replace(/%/g, "").toLowerCase(); this.filters.push((r) => String(r[c] ?? "").toLowerCase().includes(needle)); return this; }
  or(expr: string) { const m = expr.match(/^expires_at\.is\.null,expires_at\.gt\.(.+)$/); if (m) this.filters.push((r) => r.expires_at == null || String(r.expires_at) > m[1]); return this; }
  order(c: string, o?: { ascending?: boolean }) { const asc = o?.ascending !== false; this.rows = [...this.rows].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? (asc ? -1 : 1) : (asc ? 1 : -1))); return this; }
  limit(n: number) { this.limitN = n; return this; }
  private matched() { let out = this.rows.filter((r) => this.filters.every((f) => f(r))); if (this.limitN != null) out = out.slice(0, this.limitN); return out; }
  private exec(): { data: Row[] | null; error: { message: string } | null } {
    if (this.pendingInsert) {
      const row: Row = { id: newId(), created_at: new Date().toISOString(), ...this.pendingInsert };
      if (this.table === "iros_integration_tokens" && db[this.table].some((r) => r.token_hash === row.token_hash)) return { data: null, error: { message: "duplicate token_hash" } };
      if (this.table === "iros_idempotency" && db[this.table].some((r) => r.company_id === row.company_id && r.operation === row.operation && r.idem_key === row.idem_key)) return { data: null, error: { message: "duplicate key" } };
      db[this.table].push(row); return { data: [row], error: null };
    }
    if (this.pendingUpdate) { const hit = db[this.table].filter((r) => this.filters.every((f) => f(r))); hit.forEach((r) => Object.assign(r, this.pendingUpdate)); return { data: hit, error: null }; }
    if (this.isDelete) { db[this.table] = db[this.table].filter((r) => !this.filters.every((f) => f(r))); return { data: [], error: null }; }
    return { data: this.matched(), error: null };
  }
  maybeSingle() { const { data, error } = this.exec(); return Promise.resolve({ data: data?.[0] ?? null, error }); }
  single() { const { data, error } = this.exec(); if (error || !data?.[0]) return Promise.resolve({ data: null, error: error ?? { message: "no rows" } }); return Promise.resolve({ data: data[0], error: null }); }
  then(res: (v: { data: Row[] | null; error: { message: string } | null }) => void) { res(this.exec()); }
}
const mockClient = { from: (t: string) => new Query(t) };
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => mockClient, createServerSupabase: async () => { throw new Error("no session client in services"); } }));
const auditCalls: Row[] = [];
vi.mock("@/lib/platform", () => ({ writeAudit: async (e: Row) => { auditCalls.push(e); } }));
vi.mock("@/lib/ayrshare", () => ({ publishPerChannel: async () => ({ ok: true, scheduled: true, externalId: "ayr-1", postUrl: "" }) }));
vi.mock("@/lib/supabase/store", async (im) => { const a = await im<Record<string, unknown>>(); return { ...a, getMyCompany: async () => null, getMyRole: async () => null }; });

import { issueToken, actorFromToken, revokeToken, rotateToken } from "@/lib/services/tokens";
import { createConfirmation, consumeConfirmation, contentHash } from "@/lib/services/confirmations";
import { getTool } from "@/lib/gateway/tools";
import type { ActorContext } from "@/lib/services/context";

const A = "company-a", B = "company-b";
const sessionAdmin = (companyId: string): ActorContext => ({ actorId: "u1", actorEmail: "a@a.com", companyId, role: "admin", scopes: ["posts:read", "posts:write", "posts:approve", "posts:publish", "company:read", "crm:read", "crm:write"], authMethod: "session", requestId: "req-1" });

beforeEach(() => { reset(); auditCalls.length = 0; db.companies.push({ id: A, name: "Co A", ticker: "COA", quiet_mode: false, ayrshare_profile_key: "k" }); db.companies.push({ id: B, name: "Co B", ticker: "COB" }); });

// ── Token issuance + verification ──
describe("integration tokens", () => {
  it("issues a plaintext token once and stores only its hash", async () => {
    const t = await issueToken(sessionAdmin(A), { subject: "jordyn", role: "admin", scopes: ["posts:read"] });
    expect(t.token).toMatch(/^pz_/);
    const stored = db.iros_integration_tokens[0];
    expect(stored.token_hash).not.toBe(t.token);           // hash, not plaintext
    expect(String(stored.token_hash)).toHaveLength(64);     // sha256 hex
    expect(auditCalls.some((c) => c.action === "gateway.token_issued")).toBe(true);
  });

  it("member-role tokens cannot carry approve/publish scopes", async () => {
    const t = await issueToken(sessionAdmin(A), { subject: "client", role: "member", scopes: ["posts:read", "posts:approve", "posts:publish", "crm:write"] });
    expect(t.scopes).toContain("posts:read");
    expect(t.scopes).toContain("crm:write");
    expect(t.scopes).not.toContain("posts:approve");
    expect(t.scopes).not.toContain("posts:publish");
  });

  it("verifies a valid token into a company-scoped ActorContext", async () => {
    const t = await issueToken(sessionAdmin(A), { subject: "jordyn", role: "admin", scopes: ["posts:read"] });
    const ctx = await actorFromToken(t.token, "req-x");
    expect(ctx).toBeTruthy();
    expect(ctx?.companyId).toBe(A);
    expect(ctx?.authMethod).toBe("integration_token");
    expect(ctx?.scopes).toEqual(["posts:read"]);
  });

  it("rejects garbage, revoked, and expired tokens", async () => {
    expect(await actorFromToken("not-a-token", "r")).toBeNull();
    const t = await issueToken(sessionAdmin(A), { subject: "s", role: "admin", scopes: ["posts:read"] });
    await revokeToken(sessionAdmin(A), t.id);
    expect(await actorFromToken(t.token, "r")).toBeNull();
    // expire in place
    const t2 = await issueToken(sessionAdmin(A), { subject: "s", role: "admin", scopes: ["posts:read"] });
    db.iros_integration_tokens.find((r) => r.id === t2.id)!.expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await actorFromToken(t2.token, "r")).toBeNull();
  });

  it("cannot revoke another company's token", async () => {
    const t = await issueToken(sessionAdmin(A), { subject: "s", role: "admin", scopes: ["posts:read"] });
    expect(await revokeToken(sessionAdmin(B), t.id)).toBe(false);
    expect(await actorFromToken(t.token, "r")).toBeTruthy(); // still valid
  });

  it("rotation revokes the old token and issues a new working one", async () => {
    const t = await issueToken(sessionAdmin(A), { subject: "s", role: "admin", scopes: ["posts:read", "posts:approve"] });
    const next = await rotateToken(sessionAdmin(A), t.id);
    expect(next).toBeTruthy();
    expect(await actorFromToken(t.token, "r")).toBeNull();     // old dead
    expect((await actorFromToken(next!.token, "r"))?.scopes).toContain("posts:approve"); // grant preserved
  });
});

// ── Two-phase confirmations ──
describe("confirmations", () => {
  const ctx = () => ({ ...sessionAdmin(A), authMethod: "integration_token" as const, actorId: "token:tok-1" });
  it("consume succeeds once, then fails (single-use)", async () => {
    const h = contentHash(["post-1", "body", "reviewed"]);
    const { confirmationId } = await createConfirmation(ctx(), { action: "approve_content", params: { postId: "post-1" }, contentHash: h });
    const params = await consumeConfirmation(ctx(), { confirmationId, action: "approve_content", currentContentHash: h });
    expect(params.postId).toBe("post-1");
    await expect(consumeConfirmation(ctx(), { confirmationId, action: "approve_content", currentContentHash: h })).rejects.toThrowError(/already used|not found/i);
  });
  it("rejects an expired confirmation", async () => {
    const h = contentHash(["x"]);
    const { confirmationId } = await createConfirmation(ctx(), { action: "publish_content", params: {}, contentHash: h });
    db.iros_confirmations.find((r) => r.id === confirmationId)!.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(consumeConfirmation(ctx(), { confirmationId, action: "publish_content", currentContentHash: h })).rejects.toThrowError(/expired/i);
  });
  it("rejects when the underlying content changed since prepare", async () => {
    const { confirmationId } = await createConfirmation(ctx(), { action: "approve_content", params: {}, contentHash: contentHash(["old"]) });
    await expect(consumeConfirmation(ctx(), { confirmationId, action: "approve_content", currentContentHash: contentHash(["new"]) })).rejects.toThrowError(/changed/i);
  });
  it("cannot consume another company's confirmation", async () => {
    const h = contentHash(["x"]);
    const { confirmationId } = await createConfirmation(ctx(), { action: "approve_content", params: {}, contentHash: h });
    const otherCtx = { ...ctx(), companyId: B };
    await expect(consumeConfirmation(otherCtx, { confirmationId, action: "approve_content", currentContentHash: h })).rejects.toThrowError(/not found|already used/i);
  });
  it("cannot consume with the wrong action name", async () => {
    const h = contentHash(["x"]);
    const { confirmationId } = await createConfirmation(ctx(), { action: "approve_content", params: {}, contentHash: h });
    await expect(consumeConfirmation(ctx(), { confirmationId, action: "publish_content", currentContentHash: h })).rejects.toThrowError();
  });
});

// ── Tool registry wiring ──
describe("tool registry", () => {
  it("maps sensitive tools to prepare/execute with the right scopes", () => {
    expect(getTool("prepare_approve_content")?.scope).toBe("posts:approve");
    expect(getTool("execute_publish_content")?.scope).toBe("posts:publish");
    expect(getTool("create_post_draft")?.scope).toBe("posts:write");
    expect(getTool("list_posts")?.scope).toBe("posts:read");
  });
  it("unknown tool names resolve to null", () => {
    expect(getTool("drop_tables")).toBeNull();
    expect(getTool("__proto__")).toBeNull();
  });
  it("prepare_approve_content returns a confirmation + content hash for a real post", async () => {
    db.iros_posts.push({ id: "p1", company_id: A, title: "T", body: "hi", status: "reviewed", classification: "green", created_at: new Date().toISOString() });
    const tokenCtx: ActorContext = { ...sessionAdmin(A), authMethod: "integration_token", actorId: "token:tok-1" };
    const out = await getTool("prepare_approve_content")!.handler(tokenCtx, { postId: "p1" }) as Record<string, unknown>;
    expect(out.confirmationId).toBeTruthy();
    expect(out.contentHash).toBeTruthy();
    expect((out.proposed as Row).postId).toBe("p1");
  });
});

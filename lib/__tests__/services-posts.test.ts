import { describe, it, expect, vi, beforeEach } from "vitest";

// ── In-memory Supabase mock ──
// Implements just the chain surface the service layer uses, backed by plain
// arrays, so tenant isolation / gates / idempotency are tested against real
// query filters instead of hand-waved stubs.

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};

function reset() {
  db.iros_posts = [];
  db.iros_approvals = [];
  db.iros_idempotency = [];
  db.iros_disclosure_events = [];
  db.companies = [];
}

let idSeq = 1;
const newId = () => `id-${idSeq++}`;

class Query {
  private rows: Row[];
  private table: string;
  private pendingInsert: Row | null = null;
  private pendingUpdate: Row | null = null;
  private isDelete = false;
  private filters: Array<(r: Row) => boolean> = [];
  private limitN: number | null = null;

  constructor(table: string) {
    this.table = table;
    this.rows = db[table] ?? (db[table] = []);
  }
  select(_cols?: string) { return this; }
  insert(row: Row) { this.pendingInsert = row; return this; }
  update(patch: Row) { this.pendingUpdate = patch; return this; }
  delete() { this.isDelete = true; return this; }
  eq(col: string, val: unknown) { this.filters.push((r) => r[col] === val); return this; }
  not(col: string, op: string, val: unknown) { if (op === "is" && val === null) this.filters.push((r) => r[col] != null); return this; }
  lte(col: string, val: string) { this.filters.push((r) => String(r[col] ?? "") <= val); return this; }
  gte(col: string, val: string) { this.filters.push((r) => String(r[col] ?? "") >= val); return this; }
  or(expr: string) {
    // Only the quiet-period expression is used: "expires_at.is.null,expires_at.gt.<iso>"
    const m = expr.match(/^expires_at\.is\.null,expires_at\.gt\.(.+)$/);
    if (m) this.filters.push((r) => r.expires_at == null || String(r.expires_at) > m[1]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending !== false;
    this.rows = [...this.rows].sort((a, b) => (String(a[col] ?? "") < String(b[col] ?? "") ? (asc ? -1 : 1) : (asc ? 1 : -1)));
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }

  private matched(): Row[] {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }
  private exec(): { data: Row[] | null; error: { message: string } | null } {
    if (this.pendingInsert) {
      const row: Row = { id: newId(), created_at: new Date().toISOString(), ...this.pendingInsert };
      if (this.table === "iros_idempotency") {
        const dup = db[this.table].find((r) =>
          r.company_id === row.company_id && r.operation === row.operation && r.idem_key === row.idem_key);
        if (dup) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
      }
      db[this.table].push(row);
      return { data: [row], error: null };
    }
    if (this.pendingUpdate) {
      const hit = db[this.table].filter((r) => this.filters.every((f) => f(r)));
      hit.forEach((r) => Object.assign(r, this.pendingUpdate));
      return { data: hit, error: null };
    }
    if (this.isDelete) {
      const keep = db[this.table].filter((r) => !this.filters.every((f) => f(r)));
      const removed = db[this.table].length - keep.length;
      db[this.table] = keep;
      return { data: [], error: removed >= 0 ? null : { message: "delete failed" } };
    }
    return { data: this.matched(), error: null };
  }
  maybeSingle() { const { data, error } = this.exec(); return Promise.resolve({ data: data?.[0] ?? null, error }); }
  single() {
    const { data, error } = this.exec();
    if (error || !data?.[0]) return Promise.resolve({ data: null, error: error ?? { message: "no rows" } });
    return Promise.resolve({ data: data[0], error: null });
  }
  then(resolve: (v: { data: Row[] | null; error: { message: string } | null }) => void) { resolve(this.exec()); }
}

const mockClient = { from: (table: string) => new Query(table) };

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockClient,
  createServerSupabase: async () => { throw new Error("services must not use the session client"); },
}));

const auditCalls: Row[] = [];
vi.mock("@/lib/platform", () => ({
  writeAudit: async (entry: Row) => { auditCalls.push(entry); },
}));

const publishCalls: Array<{ bodies: Record<string, string> }> = [];
let publishResult: { ok: boolean; posted?: boolean; scheduled?: boolean; externalId?: string; postUrl?: string; error?: string } = { ok: true, scheduled: true, externalId: "ayr-1", postUrl: "" };
vi.mock("@/lib/ayrshare", () => ({
  publishPerChannel: async (bodies: Record<string, string>) => { publishCalls.push({ bodies }); return publishResult; },
}));

// getMyCompany/getMyRole are session-only; services never call them. Keep the
// real rowToCompany (pure) via importActual.
vi.mock("@/lib/supabase/store", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, getMyCompany: async () => null, getMyRole: async () => null };
});

import { ServiceError, type ActorContext } from "@/lib/services/context";
import { getPost, updateDraft, createDraft, decidePost, bulkDecide, publishApproved } from "@/lib/services/posts";
import { withIdempotency } from "@/lib/services/idempotency";

const A = "company-a", B = "company-b";
const admin = (companyId: string): ActorContext => ({
  actorId: "user-1", actorEmail: "admin@a.com", companyId, role: "admin",
  scopes: ["posts:read", "posts:write", "posts:approve", "posts:publish"],
  authMethod: "session", requestId: "req-1",
});
const member = (companyId: string): ActorContext => ({
  ...admin(companyId), actorId: "user-2", actorEmail: "member@a.com", role: "member",
  scopes: ["posts:read", "posts:write"],
});

function seedPost(companyId: string, over: Row = {}): string {
  const id = newId();
  db.iros_posts.push({ id, company_id: companyId, title: "t", body: "hello world", channels: ["linkedin"], status: "draft", classification: "green", created_at: new Date().toISOString(), ...over });
  return id;
}
function seedCompany(id: string, over: Row = {}) {
  db.companies.push({ id, name: "Co", ticker: "CO", quiet_mode: false, ayrshare_profile_key: "key", ...over });
}

beforeEach(() => { reset(); auditCalls.length = 0; publishCalls.length = 0; publishResult = { ok: true, scheduled: true, externalId: "ayr-1", postUrl: "" }; });

// ── Authorization ──
describe("scope enforcement", () => {
  it("member cannot approve", async () => {
    await expect(decidePost(member(A), { postId: "x", stage: "approver", decision: "approved" })).rejects.toThrowError(ServiceError);
  });
  it("member cannot publish", async () => {
    await expect(publishApproved(member(A))).rejects.toThrowError(/posts:publish/);
  });
  it("write scope required for drafts", async () => {
    const readOnly: ActorContext = { ...admin(A), scopes: ["posts:read"] };
    await expect(createDraft(readOnly, { title: "t", body: "b" })).rejects.toThrowError(/posts:write/);
  });
});

// ── Tenant isolation ──
describe("company isolation", () => {
  it("getPost never returns another tenant's post", async () => {
    const idB = seedPost(B);
    await expect(getPost(admin(A), idB)).rejects.toThrowError(/not found/i);
  });
  it("updateDraft on another tenant's id is a not_found, not an update", async () => {
    const idB = seedPost(B);
    await expect(updateDraft(admin(A), idB, { body: "hijack" })).rejects.toThrowError(/not found/i);
    expect(db.iros_posts.find((r) => r.id === idB)?.body).toBe("hello world");
  });
  it("decidePost on another tenant's id reports not found", async () => {
    const idB = seedPost(B);
    const r = await decidePost(admin(A), { postId: idB, stage: "approver", decision: "approved" });
    expect(r).toEqual({ ok: false, error: "Post not found." });
  });
});

// ── Approval gates ──
describe("approval gates", () => {
  it("RED cannot be approved by a plain approver", async () => {
    const id = seedPost(A, { classification: "red" });
    const r = await decidePost(admin(A), { postId: id, stage: "approver", decision: "approved" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/counsel/i);
  });
  it("quiet period blocks YELLOW approval", async () => {
    const id = seedPost(A, { classification: "yellow" });
    db.iros_disclosure_events.push({ id: newId(), company_id: A, event_type: "quiet_period_start", effective_at: "2000-01-01T00:00:00Z", expires_at: null });
    const r = await decidePost(admin(A), { postId: id, stage: "approver", decision: "approved" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/quiet period/i);
  });
  it("approver advances draft → reviewed and audits with the request id", async () => {
    const id = seedPost(A);
    const r = await decidePost(admin(A), { postId: id, stage: "approver", decision: "approved" });
    expect(r.ok).toBe(true);
    expect(db.iros_posts.find((p) => p.id === id)?.status).toBe("reviewed");
    const a = auditCalls.find((c) => c.action === "approval.approved");
    expect(a).toBeTruthy();
    expect((a?.payload as Row)?.requestId).toBe("req-1");
  });
  it("bulk approve skips RED and advances GREEN to approved", async () => {
    const red = seedPost(A, { classification: "red" });
    const green = seedPost(A);
    const out = await bulkDecide(admin(A), { postIds: [red, green], decision: "approved" });
    expect(out.approved).toBe(1);
    expect(out.skipped).toEqual([{ id: red, reason: "RED — needs counsel sign-off" }]);
    expect(db.iros_posts.find((p) => p.id === green)?.status).toBe("approved");
  });
});

// ── Edit-after-approval guard ──
describe("approval integrity on edit", () => {
  it("an approved post cannot be edited", async () => {
    const id = seedPost(A, { status: "approved" });
    await expect(updateDraft(admin(A), id, { body: "sneaky" })).rejects.toThrowError(/pull it back/i);
  });
  it("a draft can be edited and the change is audited", async () => {
    const id = seedPost(A);
    const p = await updateDraft(admin(A), id, { body: "new body" });
    expect(p.body).toBe("new body");
    expect(auditCalls.some((c) => c.action === "post.updated")).toBe(true);
  });
});

// ── Publishing ──
describe("publishApproved", () => {
  it("quiet mode blocks the whole run", async () => {
    seedCompany(A, { quiet_mode: true });
    const { result } = await publishApproved(admin(A));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/quiet mode/i);
    expect(publishCalls.length).toBe(0);
  });
  it("publishes approved batch posts and records the external id", async () => {
    seedCompany(A);
    const id = seedPost(A, { status: "approved", calendar_batch: "batch-1", scheduled_at: "2030-01-01T15:00:00Z" });
    const { result, replayed } = await publishApproved(admin(A));
    expect(replayed).toBe(false);
    expect(result).toMatchObject({ ok: true, scheduled: 1, failed: [] });
    const row = db.iros_posts.find((p) => p.id === id);
    expect(row?.status).toBe("scheduled");
    expect(row?.ayr_post_id).toBe("ayr-1");
    expect(auditCalls.some((c) => c.action === "social.post_scheduled")).toBe(true);
  });
  it("RED never publishes even if somehow approved", async () => {
    seedCompany(A);
    seedPost(A, { status: "approved", calendar_batch: "batch-1", classification: "red" });
    const { result } = await publishApproved(admin(A));
    expect(result.failed[0]?.reason).toMatch(/RED/);
    expect(publishCalls.length).toBe(0);
  });
  it("idempotency: the same key never publishes twice", async () => {
    seedCompany(A);
    seedPost(A, { status: "approved", calendar_batch: "batch-1" });
    const first = await publishApproved(admin(A), { idempotencyKey: "k1" });
    expect(first.replayed).toBe(false);
    expect(publishCalls.length).toBe(1);
    // Post is now 'scheduled'; a re-run would find nothing — but with the same
    // key it doesn't even run: the stored result comes back.
    const second = await publishApproved(admin(A), { idempotencyKey: "k1" });
    expect(second.replayed).toBe(true);
    expect(second.result).toMatchObject({ ok: true, scheduled: 1 });
    expect(publishCalls.length).toBe(1);
  });
});

// ── Idempotency mechanics ──
describe("withIdempotency", () => {
  it("no key = run every time", async () => {
    let runs = 0;
    await withIdempotency(admin(A), "op", null, async () => ++runs);
    await withIdempotency(admin(A), "op", null, async () => ++runs);
    expect(runs).toBe(2);
  });
  it("keys are company-scoped — same key, different tenants, both run", async () => {
    let runs = 0;
    await withIdempotency(admin(A), "op", "k", async () => ++runs);
    await withIdempotency(admin(B), "op", "k", async () => ++runs);
    expect(runs).toBe(2);
  });
  it("a failed run releases the claim so a retry can execute", async () => {
    let runs = 0;
    await expect(withIdempotency(admin(A), "op", "k", async () => { runs++; throw new Error("boom"); })).rejects.toThrowError("boom");
    const again = await withIdempotency(admin(A), "op", "k", async () => ++runs);
    expect(again.result).toBe(2);
    expect(again.replayed).toBe(false);
  });
  it("an in-flight claim conflicts instead of double-running", async () => {
    db.iros_idempotency.push({ id: newId(), company_id: A, operation: "op", idem_key: "k", status: "running", created_at: new Date().toISOString() });
    await expect(withIdempotency(admin(A), "op", "k", async () => 1)).rejects.toThrowError(/in progress/i);
  });
});

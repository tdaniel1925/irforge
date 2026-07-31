import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// In-memory Supabase mock — same array-backed Query harness shape as
// gateway.test.ts, extended with the OAuth tables and the .select("*") after
// .update() surface the OAuth core relies on (exchangeCode / refresh / revoke).

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const OAUTH_TABLES = ["oauth_clients", "oauth_auth_codes", "oauth_grants", "oauth_access_tokens", "companies"];
function reset() { for (const k of OAUTH_TABLES) db[k] = []; }
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
  or() { return this; }
  order(c: string, o?: { ascending?: boolean }) { const asc = o?.ascending !== false; this.rows = [...this.rows].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? (asc ? -1 : 1) : (asc ? 1 : -1))); return this; }
  limit(n: number) { this.limitN = n; return this; }
  private matched() { let out = this.rows.filter((r) => this.filters.every((f) => f(r))); if (this.limitN != null) out = out.slice(0, this.limitN); return out; }
  private exec(): { data: Row[] | null; error: { message: string } | null } {
    if (this.pendingInsert) {
      const row: Row = { id: newId(), created_at: new Date().toISOString(), ...this.pendingInsert };
      // unique(refresh_hash) on oauth_grants
      if (this.table === "oauth_grants" && db[this.table].some((r) => r.refresh_hash === row.refresh_hash)) return { data: null, error: { message: "duplicate refresh_hash" } };
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
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => mockClient, createServerSupabase: async () => { throw new Error("no session client in oauth core"); } }));
vi.mock("@/lib/supabase/store", async (im) => { const a = await im<Record<string, unknown>>(); return { ...a, getMyCompany: async () => null, getMyRole: async () => null }; });

import {
  verifyPkce, registerClient, getClient, redirectAllowed, issueAuthCode,
  exchangeCode, refresh, actorFromAccessToken, revokeGrant, capGrantedScopes, SAFE_ROUTE_ONLY,
} from "@/lib/oauth/server";
import { TOOLS } from "@/lib/gateway/tools";
import type { ActorContext, Scope } from "@/lib/services/context";

const A = "company-a";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

// PKCE helper: verifier → S256 challenge.
function pkce() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

async function seedClient(redirectUris = [REDIRECT]) {
  const { clientId } = await registerClient({ clientName: "Claude", redirectUris });
  return clientId;
}

// Full authorize→code helper for a signed-in admin on company A.
async function authCodeFor(clientId: string, challenge: string, scopes: Scope[]) {
  return issueAuthCode({
    clientId, companyId: A, subjectUser: "user-1", subjectEmail: "admin@a.com",
    role: "admin", scopes, redirectUri: REDIRECT, codeChallenge: challenge,
  });
}

beforeEach(() => { reset(); db.companies.push({ id: A, name: "Co A", ticker: "COA" }); });

// ── PKCE ──
describe("verifyPkce", () => {
  it("passes for the correct verifier, fails for a wrong one", () => {
    const { verifier, challenge } = pkce();
    expect(verifyPkce(verifier, challenge)).toBe(true);
    expect(verifyPkce("wrong-verifier", challenge)).toBe(false);
    expect(verifyPkce("", challenge)).toBe(false);
  });
});

// ── DCR + redirect exact match ──
describe("client registration + redirect matching", () => {
  it("stores a client and enforces EXACT redirect matching", async () => {
    const clientId = await seedClient();
    const client = await getClient(clientId);
    expect(client).toBeTruthy();
    expect(redirectAllowed(client!, REDIRECT)).toBe(true);
    // suffix / path mismatch
    expect(redirectAllowed(client!, REDIRECT + "/extra")).toBe(false);
    expect(redirectAllowed(client!, REDIRECT.replace("auth_callback", "auth_callback2"))).toBe(false);
    // different host
    expect(redirectAllowed(client!, "https://evil.com/api/mcp/auth_callback")).toBe(false);
  });
});

// ── Happy path ──
describe("authorization code flow (happy path)", () => {
  it("register → issueAuthCode → exchangeCode → actorFromAccessToken", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const scopes: Scope[] = ["posts:read", "posts:write", "company:read"];
    const code = await authCodeFor(clientId, challenge, scopes);

    const tokens = await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    expect(tokens.accessToken).toMatch(/^pzat_/);
    expect(tokens.refreshToken).toMatch(/^pzrt_/);
    expect(tokens.scopes).toEqual(scopes);

    const ctx = await actorFromAccessToken(tokens.accessToken, "req-1");
    expect(ctx).toBeTruthy();
    expect(ctx?.companyId).toBe(A);
    expect(ctx?.authMethod).toBe("oauth");
    expect(ctx?.scopes).toEqual(scopes);
    expect(ctx?.role).toBe("admin");
  });
});

// ── exchangeCode rejections ──
describe("exchangeCode rejections", () => {
  it("rejects a wrong code_verifier (PKCE fail)", async () => {
    const clientId = await seedClient();
    const { challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    await expect(exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: "bad" }))
      .rejects.toThrowError(/PKCE/i);
  });
  it("rejects a reused code (second exchange fails)", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    await expect(exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier }))
      .rejects.toThrowError(/already used|not found/i);
  });
  it("rejects a wrong redirect_uri", async () => {
    const clientId = await seedClient([REDIRECT, "https://claude.ai/other"]);
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    await expect(exchangeCode({ code, clientId, redirectUri: "https://claude.ai/other", codeVerifier: verifier }))
      .rejects.toThrowError(/redirect_uri mismatch/i);
  });
  it("rejects an expired code", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    db.oauth_auth_codes.find((r) => true)!.expires_at = new Date(Date.now() - 1000).toISOString();
    await expect(exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier }))
      .rejects.toThrowError(/expired/i);
  });
});

// ── Refresh rotation + sliding window ──
describe("refresh rotation", () => {
  it("rotates the refresh token and slides expiry", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    const t1 = await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });

    const grantBefore = db.oauth_grants[0];
    const expBefore = String(grantBefore.expires_at);

    const t2 = await refresh({ refreshToken: t1.refreshToken, clientId });
    expect(t2.refreshToken).not.toBe(t1.refreshToken);        // rotated
    expect(String(db.oauth_grants[0].expires_at) >= expBefore).toBe(true); // slid forward (>=)

    // old refresh token no longer usable directly (it's now the prev hash)
    // — proven by reuse-detection test below.
  });
});

// ── Reuse detection ──
describe("refresh reuse detection", () => {
  it("reusing an old refresh token revokes the grant, killing the rotated token too", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    const t1 = await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });

    const t2 = await refresh({ refreshToken: t1.refreshToken, clientId });   // T1 -> T2
    // Replay the OLD token T1 → reuse detected → grant revoked.
    await expect(refresh({ refreshToken: t1.refreshToken, clientId }))
      .rejects.toThrowError(/reuse detected|revoked/i);
    // Now even the legit rotated T2 must fail (grant is revoked).
    await expect(refresh({ refreshToken: t2.refreshToken, clientId }))
      .rejects.toThrowError(/revoked/i);
  });
});

// ── actorFromAccessToken guards ──
describe("actorFromAccessToken guards", () => {
  it("returns null for a revoked grant", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    const t = await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    expect(await actorFromAccessToken(t.accessToken, "r")).toBeTruthy();
    await revokeGrant({ refreshToken: t.refreshToken });
    expect(await actorFromAccessToken(t.accessToken, "r")).toBeNull();
  });
  it("returns null for an expired access token and for garbage", async () => {
    const clientId = await seedClient();
    const { verifier, challenge } = pkce();
    const code = await authCodeFor(clientId, challenge, ["posts:read"]);
    const t = await exchangeCode({ code, clientId, redirectUri: REDIRECT, codeVerifier: verifier });
    db.oauth_access_tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await actorFromAccessToken(t.accessToken, "r")).toBeNull();
    expect(await actorFromAccessToken("not-a-token", "r")).toBeNull();
  });
});

// ── Scope ceiling (safe-route cap) ──
describe("scope ceiling / safe-route cap", () => {
  it("drops posts:approve and posts:publish even for an admin (safe route)", () => {
    expect(SAFE_ROUTE_ONLY).toBe(true);
    const granted = capGrantedScopes(["posts:read", "posts:write", "posts:approve", "posts:publish", "crm:write"], "admin");
    expect(granted).toContain("posts:read");
    expect(granted).toContain("posts:write");
    expect(granted).toContain("crm:write");
    expect(granted).not.toContain("posts:approve");
    expect(granted).not.toContain("posts:publish");
  });
  it("a member never gets approve/publish and empty request defaults to read+safe-write", () => {
    const member = capGrantedScopes(["posts:approve", "posts:publish"], "member");
    expect(member).not.toContain("posts:approve");
    expect(member).not.toContain("posts:publish");
    const empty = capGrantedScopes([], "admin");
    expect(empty).toEqual(["posts:read", "posts:write", "company:read", "crm:read", "crm:write"]);
  });
  it("filters out unknown/garbage scopes", () => {
    expect(capGrantedScopes(["posts:read", "drop:everything"], "admin")).toEqual(["posts:read"]);
  });
});

// ── MCP tools/list scope filtering ──
describe("MCP tools/list scope filtering", () => {
  const listFor = (scopes: Scope[]) =>
    Object.entries(TOOLS).filter(([, def]) => scopes.includes(def.scope)).map(([name]) => name);

  it("a read+safe-write grant never lists approve/publish tools", () => {
    const ctx: ActorContext = {
      actorId: "oauth:user-1", actorEmail: "a@a.com", companyId: A, role: "admin",
      scopes: ["posts:read", "posts:write", "company:read", "crm:read", "crm:write"],
      authMethod: "oauth", requestId: "r",
    };
    const names = listFor(ctx.scopes);
    expect(names).toContain("list_posts");
    expect(names).toContain("create_post_draft");
    expect(names).not.toContain("prepare_approve_content");
    expect(names).not.toContain("execute_approve_content");
    expect(names).not.toContain("prepare_publish_content");
    expect(names).not.toContain("execute_publish_content");
  });
  it("a grant WITH approve/publish scopes does list those tools", () => {
    const names = listFor(["posts:approve", "posts:publish"]);
    expect(names).toContain("prepare_approve_content");
    expect(names).toContain("execute_publish_content");
  });
});

import crypto from "crypto";
import { createServiceClient } from "../supabase/server";
import { ALL_SCOPES, type ActorContext, type Scope } from "../services/context";

// ── OAuth 2.0 core (Authorization Code + PKCE, refresh rotation) ──
// See supabase/RUN-THIS-oauth.sql. All long-lived secrets are stored hashed.
// This module is the security-critical heart; keep it small and auditable.

const ACCESS_TTL_MS = 60 * 60 * 1000;              // 1 hour
const REFRESH_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // 90-day sliding window
const CODE_TTL_MS = 10 * 60 * 1000;                // 10 minutes

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const randToken = (prefix: string) => `${prefix}_${crypto.randomBytes(32).toString("base64url")}`;

// PKCE S256: base64url(sha256(verifier)) === challenge
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  // constant-time compare of equal-length strings
  const a = Buffer.from(computed), b = Buffer.from(challenge);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function sanitizeScopes(requested: string[]): Scope[] {
  return requested.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
}

// ── Scope ceiling for the consent screen ──
// Two caps, applied in order, to whatever the client requested:
//   1) ROLE ceiling — a member can never obtain posts:approve/posts:publish
//      (mirrors lib/services/tokens.ts issueToken; a session member simply
//      doesn't hold those scopes, but we enforce it here too, defence in depth).
//   2) SAFE-ROUTE cap — for the FIRST phase we ALSO drop posts:approve and
//      posts:publish for EVERYONE (even admins), defaulting every OAuth grant to
//      read + safe-write. This is deliberately conservative until the sensitive
//      two-phase tools have been exercised end-to-end over OAuth.
//
//   >>> TO LIFT THE SAFE-ROUTE CAP LATER: set SAFE_ROUTE_ONLY = false (or make it
//       env-driven) so admins can consent to approve/publish. The role ceiling
//       stays regardless. <<<
export const SAFE_ROUTE_ONLY = true;
const SENSITIVE_SCOPES: Scope[] = ["posts:approve", "posts:publish"];

export function capGrantedScopes(requested: string[], role: "admin" | "member"): Scope[] {
  let scopes = sanitizeScopes(requested);
  // If nothing valid was requested, default to the full safe read+write set.
  if (!scopes.length) scopes = ["posts:read", "posts:write", "company:read", "crm:read", "crm:write"];
  // (1) role ceiling
  if (role !== "admin") scopes = scopes.filter((s) => !SENSITIVE_SCOPES.includes(s));
  // (2) safe-route cap
  if (SAFE_ROUTE_ONLY) scopes = scopes.filter((s) => !SENSITIVE_SCOPES.includes(s));
  return scopes;
}

// ── Dynamic Client Registration ──
// Registration grants NOTHING; it only lets a client later ask for consent.
export async function registerClient(input: { clientName: string; redirectUris: string[] }): Promise<{ clientId: string; clientSecret?: string }> {
  const svc = createServiceClient();
  const uris = input.redirectUris.filter((u) => /^https:\/\/|^http:\/\/localhost(:\d+)?\//.test(u)).slice(0, 10);
  if (!uris.length) throw new Error("At least one https (or http://localhost) redirect URI is required.");
  const clientId = randToken("pzc");
  // Public PKCE clients (Claude Desktop) don't need a secret; we still mint one
  // for confidential clients that want it. Store only its hash.
  const clientSecret = randToken("pzs");
  await svc.from("oauth_clients").insert({
    client_id: clientId,
    client_secret_hash: sha256(clientSecret),
    client_name: input.clientName.slice(0, 200),
    redirect_uris: uris,
  });
  return { clientId, clientSecret };
}

export async function getClient(clientId: string): Promise<{ clientId: string; redirectUris: string[]; hasSecret: boolean } | null> {
  const svc = createServiceClient();
  const { data } = await svc.from("oauth_clients").select("client_id, redirect_uris, client_secret_hash").eq("client_id", clientId).maybeSingle();
  if (!data) return null;
  return { clientId: String(data.client_id), redirectUris: (data.redirect_uris as string[]) ?? [], hasSecret: !!data.client_secret_hash };
}

// Exact-match redirect URI — the primary DCR abuse guard.
export function redirectAllowed(client: { redirectUris: string[] }, redirectUri: string): boolean {
  return client.redirectUris.includes(redirectUri);
}

// ── Authorization code (issued after the user consents at /oauth/authorize) ──
export async function issueAuthCode(input: {
  clientId: string; companyId: string; subjectUser: string; subjectEmail: string;
  role: "admin" | "member"; scopes: string[]; redirectUri: string; codeChallenge: string;
}): Promise<string> {
  const svc = createServiceClient();
  const code = randToken("pzac");
  await svc.from("oauth_auth_codes").insert({
    code_hash: sha256(code),
    client_id: input.clientId,
    company_id: input.companyId,
    subject_user: input.subjectUser,
    subject_email: input.subjectEmail,
    role: input.role,
    scopes: sanitizeScopes(input.scopes),
    redirect_uri: input.redirectUri,
    code_challenge: input.codeChallenge,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  return code;
}

interface TokenBundle { accessToken: string; refreshToken: string; expiresIn: number; scopes: Scope[] }

async function mintAccessAndRefresh(grant: { id: string; company_id: string; subject_user: string | null; subject_email: string; role: string; scopes: string[] }): Promise<{ accessToken: string; refreshToken: string; refreshHash: string }> {
  const svc = createServiceClient();
  const accessToken = randToken("pzat");
  const refreshToken = randToken("pzrt");
  await svc.from("oauth_access_tokens").insert({
    token_hash: sha256(accessToken),
    grant_id: grant.id,
    company_id: grant.company_id,
    subject_user: grant.subject_user,
    subject_email: grant.subject_email,
    role: grant.role,
    scopes: grant.scopes,
    expires_at: new Date(Date.now() + ACCESS_TTL_MS).toISOString(),
  });
  return { accessToken, refreshToken, refreshHash: sha256(refreshToken) };
}

// ── Exchange authorization code → tokens (PKCE verified) ──
export async function exchangeCode(input: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenBundle> {
  const svc = createServiceClient();
  // Single-use claim: flip used_at only if currently null.
  const { data: rows } = await svc
    .from("oauth_auth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256(input.code))
    .eq("client_id", input.clientId)
    .is("used_at", null)
    .select("*");
  const row = rows?.[0];
  if (!row) throw new Error("invalid_grant: code not found or already used");
  if (new Date(String(row.expires_at)).getTime() < Date.now()) throw new Error("invalid_grant: code expired");
  if (String(row.redirect_uri) !== input.redirectUri) throw new Error("invalid_grant: redirect_uri mismatch");
  if (!verifyPkce(input.codeVerifier, String(row.code_challenge))) throw new Error("invalid_grant: PKCE verification failed");

  const scopes = (row.scopes as string[]) ?? [];
  const now = Date.now();
  // Create the grant + first token pair.
  const { data: grant } = await svc.from("oauth_grants").insert({
    client_id: input.clientId,
    company_id: row.company_id,
    subject_user: row.subject_user,
    subject_email: row.subject_email,
    role: row.role,
    scopes,
    refresh_hash: "pending",
    expires_at: new Date(now + REFRESH_WINDOW_MS).toISOString(),
  }).select("*").single();
  if (!grant) throw new Error("server_error: could not create grant");

  const { accessToken, refreshToken, refreshHash } = await mintAccessAndRefresh(grant as never);
  await svc.from("oauth_grants").update({ refresh_hash: refreshHash }).eq("id", grant.id);
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000, scopes: scopes as Scope[] };
}

// ── Refresh: rotation + reuse-detection + sliding window ──
export async function refresh(input: { refreshToken: string; clientId: string }): Promise<TokenBundle> {
  const svc = createServiceClient();
  const presentedHash = sha256(input.refreshToken);

  // Match the CURRENT refresh hash.
  const { data: grant } = await svc
    .from("oauth_grants")
    .select("*")
    .eq("client_id", input.clientId)
    .eq("refresh_hash", presentedHash)
    .maybeSingle();

  if (!grant) {
    // reuse-detection: a token that matches a PREVIOUS (already-rotated) hash is a
    // replay → the grant is compromised; revoke it entirely.
    const { data: stale } = await svc.from("oauth_grants").select("id").eq("client_id", input.clientId).eq("prev_refresh_hash", presentedHash).maybeSingle();
    if (stale) {
      await svc.from("oauth_grants").update({ revoked_at: new Date().toISOString() }).eq("id", stale.id);
      throw new Error("invalid_grant: refresh token reuse detected — grant revoked");
    }
    throw new Error("invalid_grant: unknown refresh token");
  }
  if (grant.revoked_at) throw new Error("invalid_grant: grant revoked");
  if (new Date(String(grant.expires_at)).getTime() < Date.now()) throw new Error("invalid_grant: grant expired (90-day inactivity)");

  // Rotate: new pair, slide the window, remember the old hash for reuse-detection.
  const { accessToken, refreshToken, refreshHash } = await mintAccessAndRefresh(grant as never);
  const now = Date.now();
  await svc.from("oauth_grants").update({
    refresh_hash: refreshHash,
    prev_refresh_hash: presentedHash,
    last_used_at: new Date(now).toISOString(),
    expires_at: new Date(now + REFRESH_WINDOW_MS).toISOString(),  // sliding reset
  }).eq("id", grant.id);

  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000, scopes: (grant.scopes as Scope[]) ?? [] };
}

// ── Access token → ActorContext (the reuse win) ──
export async function actorFromAccessToken(accessToken: string, requestId: string): Promise<ActorContext | null> {
  if (!accessToken?.startsWith("pzat_")) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from("oauth_access_tokens")
    .select("company_id, subject_user, subject_email, role, scopes, expires_at, grant_id")
    .eq("token_hash", sha256(accessToken))
    .maybeSingle();
  if (!data) return null;
  if (new Date(String(data.expires_at)).getTime() < Date.now()) return null;
  // Grant still alive? (revocation cascades via access-token expiry too, but check.)
  const { data: grant } = await svc.from("oauth_grants").select("revoked_at").eq("id", data.grant_id).maybeSingle();
  if (!grant || grant.revoked_at) return null;

  return {
    actorId: `oauth:${data.subject_user ?? "unknown"}`,
    actorEmail: String(data.subject_email ?? ""),
    companyId: String(data.company_id),
    role: data.role === "admin" ? "admin" : "member",
    scopes: sanitizeScopes((data.scopes as string[]) ?? []),
    authMethod: "oauth",
    requestId,
  };
}

export async function revokeGrant(input: { refreshToken?: string; grantId?: string; companyId?: string }): Promise<boolean> {
  const svc = createServiceClient();
  let q = svc.from("oauth_grants").update({ revoked_at: new Date().toISOString() }).is("revoked_at", null);
  if (input.refreshToken) q = q.eq("refresh_hash", sha256(input.refreshToken));
  else if (input.grantId) q = q.eq("id", input.grantId);
  else return false;
  if (input.companyId) q = q.eq("company_id", input.companyId);
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

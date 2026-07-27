import crypto from "crypto";
import { createServiceClient } from "../supabase/server";
import { writeAudit } from "../platform";
import { ALL_SCOPES, type ActorContext, type Scope } from "./context";

// ── Integration tokens: company-scoped bearer credentials for the gateway ──
// See supabase/RUN-THIS-gateway.sql. Plaintext token exists exactly once (the
// issue response); only its SHA-256 hash is stored. Verification is a lookup by
// hash — the secret never participates in a comparison the caller can time.

const TOKEN_BYTES = 32;
const PREFIX = "pz_";

export interface IssuedToken {
  id: string;
  token: string;        // plaintext — show once, never stored
  tokenPrefix: string;
  companyId: string;
  subject: string;
  role: "admin" | "member";
  scopes: Scope[];
  expiresAt: string | null;
}

export interface TokenRecord {
  id: string;
  tokenPrefix: string;
  subject: string;
  role: string;
  scopes: string[];
  connectorId: string;
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

function sanitizeScopes(scopes: string[]): Scope[] {
  return scopes.filter((s): s is Scope => (ALL_SCOPES as string[]).includes(s));
}

// Issue a new token for the ISSUER's company. Only session admins may call this
// (enforced by the management route); the token can never out-scope its role:
// member-role tokens are stripped of approve/publish even if requested.
export async function issueToken(issuer: ActorContext, input: {
  subject: string;
  role: "admin" | "member";
  scopes: string[];
  expiresInDays?: number;   // default 90; capped at 365
  connectorId?: string;
}): Promise<IssuedToken> {
  const svc = createServiceClient();
  const plaintext = PREFIX + crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  const scopes = sanitizeScopes(input.scopes).filter((s) =>
    input.role === "admin" ? true : s !== "posts:approve" && s !== "posts:publish");
  const days = Math.min(Math.max(input.expiresInDays ?? 90, 1), 365);
  const expiresAt = new Date(Date.now() + days * 86400e3).toISOString();

  const { data, error } = await svc.from("iros_integration_tokens").insert({
    company_id: issuer.companyId,
    token_hash: hashToken(plaintext),
    token_prefix: plaintext.slice(0, 8),
    subject: input.subject.slice(0, 200),
    role: input.role,
    scopes,
    connector_id: (input.connectorId ?? "").slice(0, 100),
    expires_at: expiresAt,
    created_by: issuer.actorId,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't issue the token.");

  await writeAudit({
    companyId: issuer.companyId, actorUserId: issuer.actorId, actorEmail: issuer.actorEmail,
    action: "gateway.token_issued", entityType: "integration_token", entityId: String(data.id),
    payload: { subject: input.subject, role: input.role, scopes, expiresAt, connectorId: input.connectorId ?? "", requestId: issuer.requestId },
  });

  return { id: String(data.id), token: plaintext, tokenPrefix: plaintext.slice(0, 8), companyId: issuer.companyId, subject: input.subject, role: input.role, scopes, expiresAt };
}

// Bearer token → ActorContext, or null (invalid/expired/revoked). The context's
// company and scopes come from the TOKEN — never from anything the caller sent.
export async function actorFromToken(bearer: string, requestId: string): Promise<ActorContext | null> {
  if (!bearer?.startsWith(PREFIX)) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from("iros_integration_tokens")
    .select("id, company_id, subject, role, scopes, expires_at, revoked_at")
    .eq("token_hash", hashToken(bearer))
    .maybeSingle();
  if (!data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(String(data.expires_at)).getTime() < Date.now()) return null;

  // Best-effort last-used stamp; never blocks the request.
  svc.from("iros_integration_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id)
    .then(() => {}, () => {});

  return {
    actorId: `token:${data.id}`,
    actorEmail: String(data.subject ?? ""),
    companyId: String(data.company_id),
    role: data.role === "admin" ? "admin" : "member",
    scopes: sanitizeScopes((data.scopes as string[]) ?? []),
    authMethod: "integration_token",
    requestId,
  };
}

export async function listTokens(ctx: ActorContext): Promise<TokenRecord[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("iros_integration_tokens")
    .select("id, token_prefix, subject, role, scopes, connector_id, issued_at, expires_at, revoked_at, last_used_at")
    .eq("company_id", ctx.companyId)
    .order("issued_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: String(r.id), tokenPrefix: String(r.token_prefix ?? ""), subject: String(r.subject ?? ""),
    role: String(r.role ?? "member"), scopes: (r.scopes as string[]) ?? [], connectorId: String(r.connector_id ?? ""),
    issuedAt: String(r.issued_at ?? ""), expiresAt: r.expires_at ? String(r.expires_at) : null,
    revokedAt: r.revoked_at ? String(r.revoked_at) : null, lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
  }));
}

export async function revokeToken(ctx: ActorContext, tokenId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("iros_integration_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("company_id", ctx.companyId)   // company-scoped: can't revoke another tenant's token
    .is("revoked_at", null)
    .select("id");
  const ok = (data?.length ?? 0) > 0;
  if (ok) {
    await writeAudit({
      companyId: ctx.companyId, actorUserId: ctx.actorId, actorEmail: ctx.actorEmail,
      action: "gateway.token_revoked", entityType: "integration_token", entityId: tokenId,
      payload: { requestId: ctx.requestId },
    });
  }
  return ok;
}

// Rotation = revoke the old + issue a fresh one with the same grant.
export async function rotateToken(ctx: ActorContext, tokenId: string): Promise<IssuedToken | null> {
  const svc = createServiceClient();
  const { data: old } = await svc
    .from("iros_integration_tokens")
    .select("id, subject, role, scopes, connector_id, expires_at")
    .eq("id", tokenId)
    .eq("company_id", ctx.companyId)
    .is("revoked_at", null)
    .maybeSingle();
  if (!old) return null;
  const revoked = await revokeToken(ctx, tokenId);
  if (!revoked) return null;
  const remainingDays = old.expires_at
    ? Math.max(1, Math.ceil((new Date(String(old.expires_at)).getTime() - Date.now()) / 86400e3))
    : 90;
  return issueToken(ctx, {
    subject: String(old.subject ?? ""),
    role: old.role === "admin" ? "admin" : "member",
    scopes: (old.scopes as string[]) ?? [],
    expiresInDays: remainingDays,
    connectorId: String(old.connector_id ?? ""),
  });
}

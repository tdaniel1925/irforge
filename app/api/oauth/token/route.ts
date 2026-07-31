import { NextResponse } from "next/server";
import { exchangeCode, refresh } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth Token Endpoint, POST /api/oauth/token ──
// Public (PKCE- / refresh-token-authed, not session). Accepts form-encoded OR
// JSON bodies. Standard OAuth error JSON. NO secrets in logs.

async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j ?? {})) out[k] = String(v ?? "");
    return out;
  }
  // form-urlencoded (the OAuth default) or multipart
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  if (form) for (const [k, v] of Array.from(form.entries())) out[k] = String(v ?? "");
  return out;
}

const oauthError = (error: string, description: string, status = 400) =>
  NextResponse.json({ error, error_description: description }, { status, headers: { "cache-control": "no-store" } });

export async function POST(req: Request) {
  const body = await readBody(req);
  const grantType = body.grant_type ?? "";

  try {
    if (grantType === "authorization_code") {
      const { code, client_id, redirect_uri, code_verifier } = body;
      if (!code || !client_id || !redirect_uri || !code_verifier) {
        return oauthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required.");
      }
      const t = await exchangeCode({ code, clientId: client_id, redirectUri: redirect_uri, codeVerifier: code_verifier });
      return NextResponse.json({
        access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn,
        refresh_token: t.refreshToken, scope: t.scopes.join(" "),
      }, { headers: { "cache-control": "no-store" } });
    }

    if (grantType === "refresh_token") {
      const { refresh_token, client_id } = body;
      if (!refresh_token || !client_id) {
        return oauthError("invalid_request", "refresh_token and client_id are required.");
      }
      const t = await refresh({ refreshToken: refresh_token, clientId: client_id });
      return NextResponse.json({
        access_token: t.accessToken, token_type: "Bearer", expires_in: t.expiresIn,
        refresh_token: t.refreshToken, scope: t.scopes.join(" "),
      }, { headers: { "cache-control": "no-store" } });
    }

    return oauthError("unsupported_grant_type", `grant_type "${grantType}" is not supported.`);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    // Core throws "invalid_grant: ..." for every code/PKCE/refresh failure.
    if (msg.startsWith("invalid_grant")) {
      return oauthError("invalid_grant", msg.replace(/^invalid_grant:\s*/, ""));
    }
    // Don't leak internals.
    return oauthError("server_error", "The token request could not be completed.", 500);
  }
}

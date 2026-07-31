import { NextResponse } from "next/server";
import { ALL_SCOPES } from "@/lib/services/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth 2.0 Authorization Server Metadata (RFC 8414) ──
// Claude's MCP client fetches this to discover the authorize/token/register
// endpoints. The issuer is the request origin so it works across environments
// (localhost, preview, prod) without hard-coding a base URL.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: ALL_SCOPES,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
  });
}

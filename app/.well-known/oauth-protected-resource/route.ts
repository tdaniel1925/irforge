import { NextResponse } from "next/server";
import { ALL_SCOPES } from "@/lib/services/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth 2.0 Protected Resource Metadata (RFC 9728) ──
// Points MCP clients at the authorization server that guards this resource (the
// MCP endpoint). The 401 from /api/gateway/mcp references this document via its
// WWW-Authenticate header.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return NextResponse.json({
    resource: `${origin}/api/gateway/mcp`,
    authorization_servers: [origin],
    scopes_supported: ALL_SCOPES,
    bearer_methods_supported: ["header"],
  });
}

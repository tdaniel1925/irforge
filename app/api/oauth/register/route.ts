import { NextResponse } from "next/server";
import { registerClient } from "@/lib/oauth/server";
import { rateAllow } from "@/lib/publicStats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Dynamic Client Registration (RFC 7591-ish), POST /api/oauth/register ──
// Public route: registration grants NOTHING — a client can register but still
// needs a human to consent at /oauth/authorize before it can touch any data.
// Per-IP rate limit so it can't be spammed into a table full of junk clients.

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  if (!(await rateAllow(`oauth_register:${clientIp(req)}`, 10))) {
    return NextResponse.json({ error: "rate_limited", error_description: "Too many registrations — try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const clientName = typeof body?.client_name === "string" ? body.client_name.trim() : "";
  const redirectUris = Array.isArray(body?.redirect_uris)
    ? body.redirect_uris.filter((u: unknown): u is string => typeof u === "string")
    : [];

  if (!clientName) {
    return NextResponse.json({ error: "invalid_client_metadata", error_description: "client_name is required." }, { status: 400 });
  }
  if (!redirectUris.length) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "At least one redirect_uri is required." }, { status: 400 });
  }

  try {
    const { clientId, clientSecret } = await registerClient({ clientName, redirectUris });
    // Re-read the stored (validated/normalized) URIs is unnecessary; registerClient
    // already filtered to https/localhost. Return what was accepted.
    return NextResponse.json({
      client_id: clientId,
      client_secret: clientSecret,             // confidential clients may use it; PKCE clients ignore it
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",      // PKCE public-client default
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: (e as Error).message }, { status: 400 });
  }
}

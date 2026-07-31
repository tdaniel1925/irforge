import { NextResponse } from "next/server";
import { revokeGrant } from "@/lib/oauth/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── OAuth Token Revocation Endpoint (RFC 7009), POST /api/oauth/revoke ──
// Accepts a refresh token. Per the RFC, revocation is idempotent and opaque:
// we ALWAYS return 200, whether or not the token existed — we never confirm or
// deny a token's existence to the caller.

async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(j ?? {})) out[k] = String(v ?? "");
    return out;
  }
  const form = await req.formData().catch(() => null);
  const out: Record<string, string> = {};
  if (form) for (const [k, v] of Array.from(form.entries())) out[k] = String(v ?? "");
  return out;
}

export async function POST(req: Request) {
  const body = await readBody(req);
  const token = body.token ?? "";
  if (token) {
    try { await revokeGrant({ refreshToken: token }); } catch { /* opaque — swallow */ }
  }
  return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } });
}
